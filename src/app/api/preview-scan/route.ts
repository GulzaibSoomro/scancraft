import { NextResponse } from "next/server";
import { runPreviewScan } from "@/lib/checks/runner";
import {
  assertPublicHttpUrl,
  normalizeTargetUrl,
} from "@/lib/checks/http";
import { createServiceClient } from "@/lib/supabase/admin";
import type { Finding } from "@/lib/types";
import type { Json } from "@/lib/database.types";

export const runtime = "nodejs";
export const maxDuration = 60;

const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 5;
const hits = new Map<string, { count: number; resetAt: number }>();

function clientIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

function rateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || now > entry.resetAt) {
    hits.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_MAX) return false;
  entry.count += 1;
  return true;
}

function findingsToJson(findings: Finding[]): Json {
  return findings.map((f) => ({
    id: f.id,
    severity: f.severity,
    title: f.title,
    location: f.location,
    detail: f.detail,
    evidence: f.evidence ?? null,
    fix: f.fix
      ? { type: f.fix.type, content: f.fix.content }
      : null,
  })) as unknown as Json;
}

export async function POST(request: Request) {
  const ip = clientIp(request);
  if (!rateLimit(ip)) {
    return NextResponse.json(
      { error: "Too many preview scans from this network. Wait a minute and try again." },
      { status: 429 }
    );
  }

  let body: { url?: string };
  try {
    body = (await request.json()) as { url?: string };
  } catch {
    return NextResponse.json({ error: "Send a JSON body with a url field." }, { status: 400 });
  }

  const rawUrl = body.url?.trim();
  if (!rawUrl) {
    return NextResponse.json({ error: "Paste a URL to scan." }, { status: 400 });
  }

  let target: URL;
  try {
    target = normalizeTargetUrl(rawUrl);
    assertPublicHttpUrl(target);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid URL" },
      { status: 400 }
    );
  }

  const startedAt = new Date().toISOString();
  let scanId: string | null = null;

  // Persist when service role is configured; still return results if DB is unavailable.
  try {
    if (process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.NEXT_PUBLIC_SUPABASE_URL) {
      const admin = createServiceClient();
      const { data, error } = await admin
        .from("preview_scans")
        .insert({
          target_url: target.toString(),
          status: "running",
          client_ip: ip,
          started_at: startedAt,
        })
        .select("id")
        .single();
      if (!error && data) scanId = data.id;
    }
  } catch {
    // continue without persistence
  }

  try {
    const result = await runPreviewScan({
      targetUrl: target.toString(),
      consentActiveProbes: false,
    });

    const completedAt = new Date().toISOString();

    if (scanId) {
      try {
        const admin = createServiceClient();
        await admin
          .from("preview_scans")
          .update({
            status: "complete",
            overall_verdict: result.verdict,
            findings: findingsToJson(result.findings),
            completed_at: completedAt,
          })
          .eq("id", scanId);
      } catch {
        // ignore persistence errors after a successful scan
      }
    }

    return NextResponse.json({
      id: scanId,
      targetUrl: target.toString(),
      status: "complete",
      verdict: result.verdict,
      findings: result.findings,
      checksRun: result.checksRun,
      completedAt,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Scan failed";
    if (scanId) {
      try {
        const admin = createServiceClient();
        await admin
          .from("preview_scans")
          .update({
            status: "failed",
            error_message: message,
            completed_at: new Date().toISOString(),
          })
          .eq("id", scanId);
      } catch {
        // ignore
      }
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
