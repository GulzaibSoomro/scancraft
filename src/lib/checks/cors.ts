import type { CheckModule, Finding } from "@/lib/types";
import {
  assertPublicHttpUrl,
  fetchWithLimits,
  normalizeTargetUrl,
} from "@/lib/checks/http";

const PROBE_ORIGINS = [
  "https://evil.example",
  "https://scancraft-probe.invalid",
];

async function probeCors(
  target: string,
  origin: string
): Promise<{
  acao: string | null;
  acac: string | null;
  status: number;
} | null> {
  try {
    // Prefer preflight — many APIs only set CORS on OPTIONS
    const optionsRes = await fetchWithLimits(
      target,
      {
        method: "OPTIONS",
        headers: {
          Origin: origin,
          "Access-Control-Request-Method": "GET",
          "Access-Control-Request-Headers": "content-type,authorization",
        },
      },
      { timeoutMs: 8000, maxBytes: 50_000 }
    );

    let acao = optionsRes.headers.get("access-control-allow-origin");
    let acac = optionsRes.headers.get("access-control-allow-credentials");

    if (!acao) {
      const getRes = await fetchWithLimits(
        target,
        {
          method: "GET",
          headers: { Origin: origin },
        },
        { timeoutMs: 8000, maxBytes: 50_000 }
      );
      acao = getRes.headers.get("access-control-allow-origin");
      acac = getRes.headers.get("access-control-allow-credentials");
      return { acao, acac, status: getRes.status };
    }

    return { acao, acac, status: optionsRes.status };
  } catch {
    return null;
  }
}

function candidateApiUrls(pageUrl: URL, html: string): string[] {
  const urls = new Set<string>();
  urls.add(pageUrl.toString());

  // Same-origin /api paths commonly exposed by AI-built apps
  for (const path of ["/api", "/api/health", "/api/users", "/rest/v1/"]) {
    urls.add(new URL(path, pageUrl).toString());
  }

  const apiMatches =
    html.match(/https?:\/\/[^"'\\\s]+\/api\/[^"'\\\s]*/gi) ?? [];
  for (const m of apiMatches.slice(0, 8)) {
    try {
      const u = new URL(m);
      if (u.hostname === pageUrl.hostname) urls.add(u.toString());
    } catch {
      // skip
    }
  }

  return Array.from(urls).slice(0, 6);
}

export const corsCheck: CheckModule = {
  id: "cors-misconfiguration",
  name: "CORS misconfiguration",
  description:
    "Sends requests with foreign Origin headers and looks for overly open CORS.",
  requiresConsent: false,
  async run(ctx) {
    let pageUrl: URL;
    try {
      pageUrl = normalizeTargetUrl(ctx.targetUrl);
      assertPublicHttpUrl(pageUrl);
    } catch (err) {
      return [
        {
          id: "cors-misconfiguration",
          severity: "info",
          title: "Could not start CORS check",
          location: ctx.targetUrl,
          detail: err instanceof Error ? err.message : "Invalid URL",
          fix: null,
        },
      ];
    }

    let html = "";
    try {
      const page = await fetchWithLimits(pageUrl.toString());
      html = page.body;
    } catch {
      // continue with just the homepage URL
    }

    const targets = candidateApiUrls(pageUrl, html);
    const findings: Finding[] = [];
    let sawWildcardWithCreds = false;
    let sawReflectedOrigin = false;
    let sawAnyCors = false;

    for (const target of targets) {
      for (const origin of PROBE_ORIGINS) {
        const result = await probeCors(target, origin);
        if (!result || !result.acao) continue;
        sawAnyCors = true;

        const acao = result.acao.trim();
        const creds =
          (result.acac ?? "").toLowerCase() === "true" ||
          (result.acac ?? "").toLowerCase() === "1";

        if (acao === "*" && creds) {
          sawWildcardWithCreds = true;
          findings.push({
            id: "cors-misconfiguration",
            severity: "critical",
            title: "CORS allows any site with credentials",
            location: target,
            detail:
              "The server responds with Access-Control-Allow-Origin: * together with Access-Control-Allow-Credentials. Browsers reject this combo, but it usually means the CORS config is confused — and nearby misconfig often ends up reflecting arbitrary origins with cookies enabled, which lets a malicious site read private API responses as the logged-in user.",
            evidence: `Origin: ${origin} → ACAO: ${acao}, ACAC: ${result.acac}`,
            fix: {
              type: "code",
              content: `Never combine ACAO: * with credentials. Allow a fixed list of trusted origins instead:\n\nAccess-Control-Allow-Origin: https://your-frontend.com\nAccess-Control-Allow-Credentials: true\nVary: Origin`,
            },
          });
        } else if (acao === "*") {
          findings.push({
            id: "cors-misconfiguration",
            severity: "warning",
            title: "CORS allows every website (*)",
            location: target,
            detail:
              "Any website can read responses from this endpoint in a visitor’s browser. That’s fine for truly public data — risky if the endpoint ever returns user-specific information.",
            evidence: `Origin: ${origin} → ACAO: *`,
            fix: {
              type: "prompt",
              content:
                "Tighten CORS so Access-Control-Allow-Origin is only our real frontend origin(s), not *. If this API is public-by-design, document that and keep auth tokens out of cookie/credentialed requests.",
            },
          });
        } else if (acao === origin) {
          sawReflectedOrigin = true;
          findings.push({
            id: "cors-misconfiguration",
            severity: creds ? "critical" : "warning",
            title: creds
              ? "CORS reflects arbitrary Origin with credentials"
              : "CORS reflects arbitrary Origin header",
            location: target,
            detail: creds
              ? "The server echoes back whatever Origin we send and allows credentials. A malicious page can make credentialed requests and read the responses — effectively stealing a logged-in user’s data."
              : "The server echoes back whatever Origin we send. Without credentials this is less severe, but it’s still a loose config that often becomes dangerous later.",
            evidence: `Origin: ${origin} → ACAO: ${acao}, ACAC: ${result.acac ?? "off"}`,
            fix: {
              type: "code",
              content: `Validate Origin against an allowlist before setting ACAO. Do not echo req.headers.origin blindly.\n\nconst allowed = new Set(["https://your-app.com"]);\nif (allowed.has(req.headers.origin)) {\n  res.setHeader("Access-Control-Allow-Origin", req.headers.origin);\n  res.setHeader("Vary", "Origin");\n}`,
            },
          });
        }
      }
    }

    // Deduplicate by title+location
    const deduped: Finding[] = [];
    const seen = new Set<string>();
    for (const f of findings) {
      const key = `${f.title}|${f.location}`;
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(f);
    }

    if (deduped.length === 0) {
      deduped.push({
        id: "cors-misconfiguration",
        severity: "pass",
        title: sawAnyCors
          ? "CORS did not reflect arbitrary origins"
          : "No open CORS behavior detected on probed URLs",
        location: pageUrl.hostname,
        detail: sawAnyCors
          ? "We sent foreign Origin headers and didn’t see wildcard+credentials or origin reflection on the URLs we probed."
          : "Probed the homepage and a few common /api paths. No Access-Control-Allow-Origin headers came back for foreign origins — typically fine for same-origin apps.",
        evidence: sawWildcardWithCreds || sawReflectedOrigin ? undefined : undefined,
        fix: null,
      });
    }

    return deduped;
  },
};
