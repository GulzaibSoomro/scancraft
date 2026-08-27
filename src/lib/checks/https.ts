import type { CheckModule, Finding } from "@/lib/types";
import {
  assertPublicHttpUrl,
  fetchWithLimits,
  normalizeTargetUrl,
} from "@/lib/checks/http";

export const httpsCheck: CheckModule = {
  id: "http-not-https",
  name: "HTTPS and mixed content",
  description: "Flags plain HTTP sites and http:// assets on HTTPS pages.",
  requiresConsent: false,
  async run(ctx) {
    let pageUrl: URL;
    try {
      pageUrl = normalizeTargetUrl(ctx.targetUrl);
      assertPublicHttpUrl(pageUrl);
    } catch (err) {
      return [
        {
          id: "http-not-https",
          severity: "info",
          title: "Could not start HTTPS check",
          location: ctx.targetUrl,
          detail: err instanceof Error ? err.message : "Invalid URL",
          fix: null,
        },
      ];
    }

    const findings: Finding[] = [];

    if (pageUrl.protocol === "http:") {
      findings.push({
        id: "http-not-https",
        severity: "critical",
        title: "Site is served over HTTP (not HTTPS)",
        location: pageUrl.toString(),
        detail:
          "Traffic to this site isn’t encrypted. Passwords, cookies, and API tokens can be sniffed on shared networks, and attackers can inject scripts into pages (SSL stripping).",
        evidence: `Protocol: ${pageUrl.protocol}`,
        fix: {
          type: "manual",
          content:
            "Enable HTTPS on your host (Vercel/Netlify/Cloudflare do this by default). Redirect all HTTP → HTTPS and add a Strict-Transport-Security header once HTTPS works.",
        },
      });
      return findings;
    }

    try {
      const page = await fetchWithLimits(pageUrl.toString());
      const mixed = page.body.match(
        /(?:src|href|action)=["']http:\/\/[^"']+/gi
      ) ?? [];
      const unique = Array.from(new Set(mixed)).slice(0, 5);

      if (unique.length > 0) {
        findings.push({
          id: "http-not-https",
          severity: "warning",
          title: "Mixed content: HTTP assets on an HTTPS page",
          location: pageUrl.pathname || "/",
          detail:
            "The page is HTTPS, but some scripts/images/forms still load over http://. Modern browsers may block those assets — and on older clients they weaken the lock icon’s protection.",
          evidence: unique.join("\n"),
          fix: {
            type: "prompt",
            content:
              "Replace every http:// asset URL with https:// (or protocol-relative // only if the CDN supports HTTPS). Search the codebase for http:// and update image/script/API base URLs.",
          },
        });
      } else {
        findings.push({
          id: "http-not-https",
          severity: "pass",
          title: "Site uses HTTPS without obvious mixed content",
          location: pageUrl.hostname,
          detail:
            "The URL is HTTPS and the homepage HTML didn’t reference plain http:// assets in common attributes.",
          fix: null,
        });
      }
    } catch {
      findings.push({
        id: "http-not-https",
        severity: "info",
        title: "HTTPS is configured; page body not inspected",
        location: pageUrl.hostname,
        detail: "Couldn’t download the page to check for mixed content.",
        fix: null,
      });
    }

    return findings;
  },
};
