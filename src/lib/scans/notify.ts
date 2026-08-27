import type { Finding } from "@/lib/types";
import { getAppUrl } from "@/lib/stripe";

type AlertPayload = {
  projectName: string;
  projectId: string;
  scanId: string;
  targetUrl: string;
  verdict: string;
  newFindings: Finding[];
  email?: string | null;
  alertEmailEnabled: boolean;
  slackWebhookUrl?: string | null;
};

export async function sendScanAlerts(payload: AlertPayload): Promise<{
  emailSent: boolean;
  slackSent: boolean;
  errors: string[];
}> {
  const errors: string[] = [];
  let emailSent = false;
  let slackSent = false;

  if (payload.newFindings.length === 0) {
    return { emailSent, slackSent, errors };
  }

  const reportUrl = `${getAppUrl()}/dashboard/scans/${payload.scanId}`;
  const summary = payload.newFindings
    .slice(0, 10)
    .map((f) => `• [${f.severity}] ${f.title} (${f.location})`)
    .join("\n");

  if (payload.slackWebhookUrl) {
    try {
      const res = await fetch(payload.slackWebhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: `ScanCraft alert: new issues on *${payload.projectName}* (${payload.verdict})\n${summary}\n${reportUrl}`,
        }),
      });
      if (!res.ok) {
        errors.push(`Slack webhook HTTP ${res.status}`);
      } else {
        slackSent = true;
      }
    } catch (err) {
      errors.push(err instanceof Error ? err.message : "Slack failed");
    }
  }

  if (
    payload.alertEmailEnabled &&
    payload.email &&
    process.env.RESEND_API_KEY
  ) {
    try {
      const from =
        process.env.RESEND_FROM_EMAIL || "ScanCraft <onboarding@resend.dev>";
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: [payload.email],
          subject: `ScanCraft: new findings on ${payload.projectName}`,
          text: [
            `Weekly re-scan found new issues on ${payload.projectName}.`,
            `URL: ${payload.targetUrl}`,
            `Verdict: ${payload.verdict}`,
            ``,
            summary,
            ``,
            `Open the report: ${reportUrl}`,
          ].join("\n"),
        }),
      });
      if (!res.ok) {
        const body = await res.text();
        errors.push(`Email HTTP ${res.status}: ${body.slice(0, 200)}`);
      } else {
        emailSent = true;
      }
    } catch (err) {
      errors.push(err instanceof Error ? err.message : "Email failed");
    }
  }

  return { emailSent, slackSent, errors };
}
