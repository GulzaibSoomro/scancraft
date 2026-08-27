import type { CheckModule, Finding } from "@/lib/types";
import {
  absoluteUrl,
  assertPublicHttpUrl,
  fetchWithLimits,
  normalizeTargetUrl,
} from "@/lib/checks/http";

/** Harmless marker — never a real exploit payload. */
const MARKER = "scancraftxss1337";
const PAYLOAD = `<script>${MARKER}</script>`;

function reflectionRisky(body: string): boolean {
  // Unescaped script tag with our marker
  if (body.includes(PAYLOAD)) return true;
  if (
    body.includes(`<script>${MARKER}`) ||
    body.includes(`<script type="text/javascript">${MARKER}`)
  ) {
    return true;
  }
  // Reflected into an event handler context without encoding
  if (new RegExp(`on\\w+\\s*=\\s*["'][^"']*${MARKER}`, "i").test(body)) {
    return true;
  }
  return false;
}

function collectProbeUrls(pageUrl: URL, html: string): string[] {
  const urls = new Set<string>();
  // Query reflection on homepage
  const u = new URL(pageUrl.toString());
  u.searchParams.set("q", PAYLOAD);
  u.searchParams.set("search", PAYLOAD);
  urls.add(u.toString());

  const formRe = /<form[^>]*action=["']([^"']*)["'][^>]*>/gi;
  let formMatch: RegExpExecArray | null;
  while ((formMatch = formRe.exec(html))) {
    const action = absoluteUrl(
      pageUrl.toString(),
      formMatch[1] || pageUrl.pathname
    );
    if (!action) continue;
    try {
      const formUrl = new URL(action);
      if (formUrl.hostname !== pageUrl.hostname) continue;
      formUrl.searchParams.set("q", PAYLOAD);
      urls.add(formUrl.toString());
    } catch {
      // skip
    }
  }

  // Common search endpoints
  for (const path of ["/search", "/api/search"]) {
    const s = new URL(path, pageUrl);
    s.searchParams.set("q", PAYLOAD);
    urls.add(s.toString());
  }

  return Array.from(urls).slice(0, 8);
}

export const xssProbeCheck: CheckModule = {
  id: "xss-probe",
  name: "Basic XSS reflection probe",
  description:
    "Sends a harmless script marker into query params and looks for unescaped reflection.",
  requiresConsent: true,
  async run(ctx) {
    if (!ctx.consentActiveProbes) {
      return [
        {
          id: "xss-probe",
          severity: "info",
          title: "XSS probe skipped (no consent)",
          location: ctx.targetUrl,
          detail:
            "Active probes need your explicit OK because they send test input to the live app.",
          fix: null,
        },
      ];
    }

    let pageUrl: URL;
    try {
      pageUrl = normalizeTargetUrl(ctx.targetUrl);
      assertPublicHttpUrl(pageUrl);
    } catch (err) {
      return [
        {
          id: "xss-probe",
          severity: "info",
          title: "Could not start XSS probe",
          location: ctx.targetUrl,
          detail: err instanceof Error ? err.message : "Invalid URL",
          fix: null,
        },
      ];
    }

    let html = "";
    try {
      html = (await fetchWithLimits(pageUrl.toString())).body;
    } catch {
      html = "";
    }

    const targets = collectProbeUrls(pageUrl, html);
    const findings: Finding[] = [];

    for (const target of targets) {
      try {
        const res = await fetchWithLimits(
          target,
          {},
          { timeoutMs: 8000, maxBytes: 400_000 }
        );
        if (res.status >= 400) continue;
        if (reflectionRisky(res.body)) {
          const path = new URL(target).pathname;
          findings.push({
            id: "xss-probe",
            severity: "critical",
            title: "Possible reflected XSS (unescaped probe marker)",
            location: path,
            detail:
              "Our harmless test string came back in the HTML without being escaped. That means a real attacker could inject script into someone else’s browser if they craft a malicious link. We did not run any harmful code.",
            evidence: `Reflected unescaped marker on ${path}?…`,
            fix: {
              type: "prompt",
              content:
                "Escape all user-controlled input before putting it in HTML. In React, prefer text children over dangerouslySetInnerHTML. For raw HTML templates, use a sanitizer (DOMPurify) or framework auto-escaping. Add a strict Content-Security-Policy as defense-in-depth.",
            },
          });
        }
      } catch {
        // skip
      }
    }

    // Deduplicate by location
    const deduped: Finding[] = [];
    const seen = new Set<string>();
    for (const f of findings) {
      if (seen.has(f.location)) continue;
      seen.add(f.location);
      deduped.push(f);
    }

    if (deduped.length === 0) {
      deduped.push({
        id: "xss-probe",
        severity: "pass",
        title: "No unescaped XSS marker reflection found",
        location: pageUrl.hostname,
        detail: `Sent a harmless marker to ${targets.length} URL(s). None returned it inside a raw <script> or event-handler context.`,
        fix: null,
      });
    }

    return deduped;
  },
};
