import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canStartFullScan } from "@/lib/billing/limits";
import {
  assertPublicHttpUrl,
  normalizeTargetUrl,
} from "@/lib/checks/http";
import type { Platform } from "@/lib/types";

export const runtime = "nodejs";

const PLATFORMS: Platform[] = [
  "lovable",
  "bolt",
  "cursor",
  "v0",
  "replit",
  "other",
];

function projectNameFromUrl(url: URL): string {
  return url.hostname.replace(/^www\./, "") || "Untitled project";
}

export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Sign in to run a full scan." }, { status: 401 });
  }

  let body: {
    url?: string;
    name?: string;
    platform?: string;
    githubRepoUrl?: string;
    projectId?: string;
    consentActiveProbes?: boolean;
  };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const allowance = await canStartFullScan(supabase, user.id);
  if (!allowance.allowed) {
    return NextResponse.json(
      { error: allowance.reason, code: "tier_limit" },
      { status: 402 }
    );
  }

  let target: URL;
  let projectId = body.projectId;

  if (projectId) {
    const { data: existing, error } = await supabase
      .from("projects")
      .select("id, deployed_url")
      .eq("id", projectId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (error || !existing) {
      return NextResponse.json({ error: "Project not found." }, { status: 404 });
    }
    try {
      target = normalizeTargetUrl(existing.deployed_url);
      assertPublicHttpUrl(target);
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Invalid project URL" },
        { status: 400 }
      );
    }
  } else {
    const rawUrl = body.url?.trim();
    if (!rawUrl) {
      return NextResponse.json({ error: "Paste your deployed app URL." }, { status: 400 });
    }
    try {
      target = normalizeTargetUrl(rawUrl);
      assertPublicHttpUrl(target);
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Invalid URL" },
        { status: 400 }
      );
    }

    const platform =
      body.platform && PLATFORMS.includes(body.platform as Platform)
        ? (body.platform as Platform)
        : null;

    const githubRepoUrl = body.githubRepoUrl?.trim() || null;
    if (githubRepoUrl) {
      try {
        const gh = new URL(githubRepoUrl);
        if (!["github.com", "www.github.com"].includes(gh.hostname)) {
          return NextResponse.json(
            { error: "GitHub repo URL must be on github.com." },
            { status: 400 }
          );
        }
      } catch {
        return NextResponse.json({ error: "Invalid GitHub repo URL." }, { status: 400 });
      }
    }

    const name = body.name?.trim() || projectNameFromUrl(target);

    // Reuse project with same URL for this user when possible
    const { data: matched } = await supabase
      .from("projects")
      .select("id")
      .eq("user_id", user.id)
      .eq("deployed_url", target.toString())
      .maybeSingle();

    if (matched) {
      projectId = matched.id;
      await supabase
        .from("projects")
        .update({
          name,
          platform,
          github_repo_url: githubRepoUrl,
        })
        .eq("id", matched.id);
    } else {
      const { data: created, error: createError } = await supabase
        .from("projects")
        .insert({
          user_id: user.id,
          name,
          deployed_url: target.toString(),
          platform,
          github_repo_url: githubRepoUrl,
        })
        .select("id")
        .single();

      if (createError || !created) {
        return NextResponse.json(
          { error: createError?.message ?? "Could not create project." },
          { status: 500 }
        );
      }
      projectId = created.id;
    }
  }

  const { data: scan, error: scanError } = await supabase
    .from("scans")
    .insert({
      project_id: projectId!,
      status: "queued",
      is_preview: false,
    })
    .select("id")
    .single();

  if (scanError || !scan) {
    return NextResponse.json(
      { error: scanError?.message ?? "Could not queue scan." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    scanId: scan.id,
    projectId,
    status: "queued",
    consentActiveProbes: !!body.consentActiveProbes,
    tier: allowance.tier,
  });
}
