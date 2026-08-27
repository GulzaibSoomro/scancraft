import type { CheckModule, Finding } from "@/lib/types";
import {
  assertPublicHttpUrl,
  fetchWithLimits,
  normalizeTargetUrl,
} from "@/lib/checks/http";

const ENV_PATHS = [
  "/.env",
  "/.env.local",
  "/.env.production",
  "/.env.development",
  "/.env.prod",
];

function looksLikeEnvFile(body: string): boolean {
  const sample = body.slice(0, 4000);
  if (!sample.trim()) return false;
  // KEY=value lines, ignore HTML error pages
  if (/<!DOCTYPE|<html|<body/i.test(sample)) return false;
  const lines = sample.split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith("#"));
  if (lines.length === 0) return false;
  const kv = lines.filter((l) => /^[A-Za-z_][A-Za-z0-9_]*\s*=/.test(l));
  return kv.length >= 1 && kv.length / lines.length >= 0.4;
}

export const envFileExposedCheck: CheckModule = {
  id: "env-file-exposed",
  name: "Public .env files",
  description: "Tries to fetch common .env paths that should never be web-accessible.",
  requiresConsent: false,
  async run(ctx) {
    let pageUrl: URL;
    try {
      pageUrl = normalizeTargetUrl(ctx.targetUrl);
      assertPublicHttpUrl(pageUrl);
    } catch (err) {
      return [
        {
          id: "env-file-exposed",
          severity: "info",
          title: "Could not start .env check",
          location: ctx.targetUrl,
          detail: err instanceof Error ? err.message : "Invalid URL",
          fix: null,
        },
      ];
    }

    const findings: Finding[] = [];

    for (const path of ENV_PATHS) {
      const url = new URL(path, pageUrl).toString();
      try {
        const res = await fetchWithLimits(
          url,
          { redirect: "manual" },
          { timeoutMs: 8000, maxBytes: 100_000 }
        );
        // Follow only if still same host and 200
        if (res.status === 200 && looksLikeEnvFile(res.body)) {
          findings.push({
            id: "env-file-exposed",
            severity: "critical",
            title: `Environment file publicly reachable (${path})`,
            location: path,
            detail:
              "A .env-style file is downloadable from the internet. These files often hold database passwords, API secrets, and service-role keys. Anyone who finds this URL can take over your backend.",
            evidence: `GET ${path} → 200 with key=value content (${res.body.split(/\r?\n/).length} lines sampled)`,
            fix: {
              type: "manual",
              content:
                "Remove .env files from the web root immediately. Rotate every secret that was in the file. On Vercel/Netlify/etc., use the host’s environment variable UI — never commit or deploy .env into public static output. Add .env* to .gitignore and block these paths in your host/CDN config.",
            },
          });
        }
      } catch {
        // unreachable path — fine
      }
    }

    if (findings.length === 0) {
      findings.push({
        id: "env-file-exposed",
        severity: "pass",
        title: "Common .env paths not publicly readable",
        location: pageUrl.hostname,
        detail:
          "We tried the usual /.env locations and didn’t get back key=value secrets. Keep those files out of your deploy output.",
        fix: null,
      });
    }

    return findings;
  },
};
