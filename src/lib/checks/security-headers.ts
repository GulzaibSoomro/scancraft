import type { CheckModule, Finding } from "@/lib/types";
import {
  assertPublicHttpUrl,
  fetchWithLimits,
  normalizeTargetUrl,
} from "@/lib/checks/http";

const HEADER_CHECKS: {
  name: string;
  header: string;
  severity: "warning" | "info";
  why: string;
  fix: string;
}[] = [
  {
    name: "Content-Security-Policy",
    header: "content-security-policy",
    severity: "warning",
    why: "A Content Security Policy (CSP) limits which scripts can run. Without it, a successful XSS attack has a much easier time.",
    fix: `Add a Content-Security-Policy header. Start strict and loosen only as needed:\n\nContent-Security-Policy: default-src 'self'; script-src 'self'; object-src 'none'; base-uri 'self';`,
  },
  {
    name: "Strict-Transport-Security",
    header: "strict-transport-security",
    severity: "warning",
    why: "HSTS tells browsers to always use HTTPS for your domain, which blocks SSL-stripping downgrade attacks.",
    fix: `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`,
  },
  {
    name: "X-Frame-Options",
    header: "x-frame-options",
    severity: "warning",
    why: "Stops other sites from embedding your pages in an iframe (clickjacking). CSP frame-ancestors is the modern alternative — either works.",
    fix: `X-Frame-Options: DENY\n\n# or in CSP:\nContent-Security-Policy: frame-ancestors 'none';`,
  },
  {
    name: "X-Content-Type-Options",
    header: "x-content-type-options",
    severity: "info",
    why: "Prevents browsers from “guessing” a file type, which can turn a downloaded file into executable content.",
    fix: `X-Content-Type-Options: nosniff`,
  },
];

export const securityHeadersCheck: CheckModule = {
  id: "missing-security-headers",
  name: "Missing security headers",
  description:
    "Checks for CSP, HSTS, X-Frame-Options, and X-Content-Type-Options.",
  requiresConsent: false,
  async run(ctx) {
    let pageUrl: URL;
    try {
      pageUrl = normalizeTargetUrl(ctx.targetUrl);
      assertPublicHttpUrl(pageUrl);
    } catch (err) {
      return [
        {
          id: "missing-security-headers",
          severity: "info",
          title: "Could not start header check",
          location: ctx.targetUrl,
          detail: err instanceof Error ? err.message : "Invalid URL",
          fix: null,
        },
      ];
    }

    let headers: Headers;
    try {
      const res = await fetchWithLimits(pageUrl.toString(), { method: "GET" });
      headers = res.headers;
    } catch {
      return [
        {
          id: "missing-security-headers",
          severity: "warning",
          title: "Could not fetch response headers",
          location: pageUrl.toString(),
          detail: "The site didn’t respond, so we couldn’t inspect security headers.",
          fix: null,
        },
      ];
    }

    const findings: Finding[] = [];
    const csp = headers.get("content-security-policy");
    const hasFrameAncestors = !!csp && /frame-ancestors/i.test(csp);

    for (const check of HEADER_CHECKS) {
      const value = headers.get(check.header);
      const satisfied =
        !!value ||
        (check.header === "x-frame-options" && hasFrameAncestors);

      if (!satisfied) {
        findings.push({
          id: "missing-security-headers",
          severity: check.severity,
          title: `Missing ${check.name} header`,
          location: pageUrl.hostname,
          detail: check.why,
          evidence: `Response did not include ${check.name}`,
          fix: {
            type: "code",
            content: check.fix,
          },
        });
      }
    }

    if (findings.length === 0) {
      findings.push({
        id: "missing-security-headers",
        severity: "pass",
        title: "Core security headers present",
        location: pageUrl.hostname,
        detail:
          "CSP, HSTS, framing protection, and nosniff are all present. Headers alone don’t stop every attack, but they’re solid defense-in-depth.",
        fix: null,
      });
    }

    return findings;
  },
};
