import type { CheckContext, CheckModule, Finding } from "@/lib/types";
import { verdictFromFindings } from "@/lib/utils/redact";
import {
  getPreviewChecks,
  getChecksForPlatform,
} from "@/lib/checks/registry";

export type ScanRunResult = {
  findings: Finding[];
  verdict: "at_risk" | "secure";
  checksRun: string[];
  errors: { checkId: string; message: string }[];
};

async function runModules(
  modules: CheckModule[],
  ctx: CheckContext
): Promise<ScanRunResult> {
  const applicable = modules.filter((m) => {
    if (m.requiresConsent && !ctx.consentActiveProbes) return false;
    // Repo checks can use a public githubRepoUrl without an OAuth token.
    if (m.requiresRepo && !ctx.githubAccessToken && !ctx.githubRepoUrl) {
      return false;
    }
    return true;
  });

  const settled = await Promise.allSettled(
    applicable.map(async (m) => {
      const findings = await m.run(ctx);
      return { checkId: m.id, findings };
    })
  );

  const findings: Finding[] = [];
  const errors: { checkId: string; message: string }[] = [];
  const checksRun: string[] = [];

  for (let i = 0; i < settled.length; i++) {
    const checkId = applicable[i].id;
    const result = settled[i];
    checksRun.push(checkId);
    if (result.status === "fulfilled") {
      findings.push(...result.value.findings);
    } else {
      const message =
        result.reason instanceof Error
          ? result.reason.message
          : "Check failed unexpectedly";
      errors.push({ checkId, message });
      findings.push({
        id: checkId,
        severity: "info",
        title: `Check "${checkId}" could not finish`,
        location: ctx.targetUrl,
        detail: `Something went wrong while running this check: ${message}. Other checks still ran.`,
        fix: null,
      });
    }
  }

  return {
    findings,
    verdict: verdictFromFindings(findings),
    checksRun,
    errors,
  };
}

export function runPreviewScan(ctx: CheckContext): Promise<ScanRunResult> {
  return runModules(getPreviewChecks(), ctx);
}

export function runFullScan(ctx: CheckContext): Promise<ScanRunResult> {
  return runModules(getChecksForPlatform(ctx.platform), ctx);
}
