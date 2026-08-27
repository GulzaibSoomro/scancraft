import { createServiceClient } from "@/lib/supabase/admin";
import { executeScanJob, dbFindingToFinding } from "@/lib/scans/execute";
import { diffNewRiskFindings } from "@/lib/scans/diff";
import { sendScanAlerts } from "@/lib/scans/notify";
import type { Finding } from "@/lib/types";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
/** Cap per cron tick so we stay inside serverless time limits. */
const MAX_PROJECTS_PER_RUN = 3;

export type ScheduleRunResult = {
  processed: number;
  skipped: number;
  alerts: number;
  details: {
    projectId: string;
    scanId?: string;
    status: string;
    newFindings?: number;
    error?: string;
  }[];
};

function nextWeekIso(from = new Date()): string {
  return new Date(from.getTime() + WEEK_MS).toISOString();
}

export async function runDueScheduledScans(): Promise<ScheduleRunResult> {
  const admin = createServiceClient();
  const now = new Date();
  const nowIso = now.toISOString();

  // Projects due for weekly re-scan
  const { data: candidates, error } = await admin
    .from("projects")
    .select(
      "id, user_id, name, deployed_url, weekly_rescan_enabled, last_auto_scan_at, next_auto_scan_at"
    )
    .eq("weekly_rescan_enabled", true)
    .limit(40);

  if (error) {
    throw new Error(`Failed to load schedules: ${error.message}`);
  }

  const due = (candidates ?? []).filter((p) => {
    if (!p.next_auto_scan_at) return true;
    return new Date(p.next_auto_scan_at).getTime() <= now.getTime();
  });

  const details: ScheduleRunResult["details"] = [];
  let processed = 0;
  let skipped = 0;
  let alerts = 0;

  for (const project of due) {
    if (processed >= MAX_PROJECTS_PER_RUN) {
      skipped += 1;
      details.push({ projectId: project.id, status: "deferred" });
      continue;
    }

    const { data: profile } = await admin
      .from("profiles")
      .select(
        "subscription_tier, email, alert_email_enabled, slack_webhook_url"
      )
      .eq("id", project.user_id)
      .maybeSingle();

    if (!profile || profile.subscription_tier !== "pro") {
      // Disable schedule if user dropped to free
      await admin
        .from("projects")
        .update({ weekly_rescan_enabled: false, next_auto_scan_at: null })
        .eq("id", project.id);
      skipped += 1;
      details.push({ projectId: project.id, status: "skipped_not_pro" });
      continue;
    }

    // Previous completed scan for diff
    const { data: priorScans } = await admin
      .from("scans")
      .select("id")
      .eq("project_id", project.id)
      .eq("status", "complete")
      .order("created_at", { ascending: false })
      .limit(1);

    const priorScanId = priorScans?.[0]?.id;
    let previousFindings: Finding[] = [];
    if (priorScanId) {
      const { data: rows } = await admin
        .from("findings")
        .select(
          "check_id, severity, title, location, detail, evidence, fix_type, fix_content"
        )
        .eq("scan_id", priorScanId);
      previousFindings = (rows ?? []).map(dbFindingToFinding);
    }

    const { data: scan, error: scanError } = await admin
      .from("scans")
      .insert({
        project_id: project.id,
        status: "queued",
        is_preview: false,
        trigger: "scheduled",
      })
      .select("id")
      .single();

    if (scanError || !scan) {
      details.push({
        projectId: project.id,
        status: "failed_queue",
        error: scanError?.message,
      });
      continue;
    }

    try {
      await executeScanJob(admin, scan.id, { consentActiveProbes: false });

      const { data: findingRows } = await admin
        .from("findings")
        .select(
          "check_id, severity, title, location, detail, evidence, fix_type, fix_content"
        )
        .eq("scan_id", scan.id);

      const currentFindings = (findingRows ?? []).map(dbFindingToFinding);
      const { data: completed } = await admin
        .from("scans")
        .select("overall_verdict")
        .eq("id", scan.id)
        .single();

      const newRisks = diffNewRiskFindings(previousFindings, currentFindings);

      if (newRisks.length > 0) {
        const notify = await sendScanAlerts({
          projectName: project.name,
          projectId: project.id,
          scanId: scan.id,
          targetUrl: project.deployed_url,
          verdict: completed?.overall_verdict ?? "at_risk",
          newFindings: newRisks,
          email: profile.email,
          alertEmailEnabled: profile.alert_email_enabled,
          slackWebhookUrl: profile.slack_webhook_url,
        });
        if (notify.emailSent || notify.slackSent) alerts += 1;
        if (notify.errors.length) {
          console.error("[schedule alerts]", project.id, notify.errors);
        }
      }

      await admin
        .from("projects")
        .update({
          last_auto_scan_at: nowIso,
          next_auto_scan_at: nextWeekIso(now),
        })
        .eq("id", project.id);

      processed += 1;
      details.push({
        projectId: project.id,
        scanId: scan.id,
        status: "complete",
        newFindings: newRisks.length,
      });
    } catch (err) {
      await admin
        .from("projects")
        .update({
          last_auto_scan_at: nowIso,
          // Retry sooner on failure (1 day) instead of waiting a full week
          next_auto_scan_at: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
        })
        .eq("id", project.id);

      details.push({
        projectId: project.id,
        scanId: scan.id,
        status: "failed",
        error: err instanceof Error ? err.message : "scan failed",
      });
    }
  }

  return { processed, skipped, alerts, details };
}

export { nextWeekIso };
