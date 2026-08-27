import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import type { Finding, Platform } from "@/lib/types";
import { runFullScan } from "@/lib/checks/runner";
import {
  assertPublicHttpUrl,
  normalizeTargetUrl,
} from "@/lib/checks/http";

type Client = SupabaseClient<Database>;

export async function persistFindings(
  supabase: Client,
  scanId: string,
  findings: Finding[]
) {
  if (findings.length === 0) return;

  const rows = findings.map((f) => ({
    scan_id: scanId,
    check_id: f.id,
    severity: f.severity,
    title: f.title,
    location: f.location,
    detail: f.detail,
    evidence: f.evidence ?? null,
    fix_type: f.fix?.type ?? null,
    fix_content: f.fix?.content ?? null,
  }));

  const { error } = await supabase.from("findings").insert(rows);
  if (error) {
    throw new Error(`Failed to save findings: ${error.message}`);
  }
}

export function dbFindingToFinding(row: {
  check_id: string;
  severity: Finding["severity"];
  title: string;
  location: string | null;
  detail: string;
  evidence: string | null;
  fix_type: "code" | "prompt" | "manual" | null;
  fix_content: string | null;
}): Finding {
  return {
    id: row.check_id,
    severity: row.severity,
    title: row.title,
    location: row.location ?? "",
    detail: row.detail,
    evidence: row.evidence ?? undefined,
    fix:
      row.fix_type && row.fix_content
        ? { type: row.fix_type, content: row.fix_content }
        : null,
  };
}

export async function executeScanJob(
  supabase: Client,
  scanId: string,
  opts: { consentActiveProbes: boolean }
) {
  const { data: scan, error: scanError } = await supabase
    .from("scans")
    .select("id, status, project_id")
    .eq("id", scanId)
    .single();

  if (scanError || !scan) {
    throw new Error("Scan not found.");
  }

  if (scan.status === "complete") {
    return { status: "complete" as const };
  }
  if (scan.status === "running") {
    return { status: "running" as const };
  }

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("deployed_url, github_repo_url, platform")
    .eq("id", scan.project_id)
    .single();

  if (projectError || !project) {
    throw new Error("Project not found for this scan.");
  }

  const target = normalizeTargetUrl(project.deployed_url);
  assertPublicHttpUrl(target);

  await supabase
    .from("scans")
    .update({
      status: "running",
      started_at: new Date().toISOString(),
      error_message: null,
    })
    .eq("id", scanId);

  try {
    const result = await runFullScan({
      targetUrl: target.toString(),
      consentActiveProbes: opts.consentActiveProbes,
      platform: (project.platform as Platform | null) ?? undefined,
      githubRepoUrl: project.github_repo_url ?? undefined,
    });

    await persistFindings(supabase, scanId, result.findings);

    await supabase
      .from("scans")
      .update({
        status: "complete",
        overall_verdict: result.verdict,
        completed_at: new Date().toISOString(),
      })
      .eq("id", scanId);

    return {
      status: "complete" as const,
      verdict: result.verdict,
      findingCount: result.findings.length,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Scan failed";
    await supabase
      .from("scans")
      .update({
        status: "failed",
        error_message: message,
        completed_at: new Date().toISOString(),
      })
      .eq("id", scanId);
    throw err;
  }
}
