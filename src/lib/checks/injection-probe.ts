import type { CheckModule, Finding } from "@/lib/types";
import {
  assertPublicHttpUrl,
  fetchWithLimits,
  normalizeTargetUrl,
} from "@/lib/checks/http";

const SQL_PAYLOADS = ["'", "\"", "' OR '1'='1", "1; SELECT 1"];
const NOSQL_PAYLOADS = ["{$ne:null}", '{"$gt":""}'];

const ERROR_HINTS =
  /sql syntax|sqlite|postgresql|mysql|ora-\d{5}|unclosed quotation|pg_query|sequelize|mongoose|cast error|mongoerror|syntax error at or near|odbc|jdbc/i;

function candidateEndpoints(pageUrl: URL, html: string): string[] {
  const urls = new Set<string>();
  urls.add(pageUrl.toString());

  for (const path of ["/api", "/api/search", "/api/items", "/api/users", "/search"]) {
    urls.add(new URL(path, pageUrl).toString());
  }

  const apiLinks = html.match(/["'](\/api\/[a-zA-Z0-9_\-/]+)["']/g) ?? [];
  for (const raw of apiLinks.slice(0, 10)) {
    const path = raw.replace(/['"]/g, "");
    urls.add(new URL(path, pageUrl).toString());
  }

  return Array.from(urls).slice(0, 8);
}

export const injectionProbeCheck: CheckModule = {
  id: "injection-probe",
  name: "SQL/NoSQL injection probe",
  description:
    "Sends non-destructive injection test strings and watches for database error leakage.",
  requiresConsent: true,
  async run(ctx) {
    if (!ctx.consentActiveProbes) {
      return [
        {
          id: "injection-probe",
          severity: "info",
          title: "Injection probe skipped (no consent)",
          location: ctx.targetUrl,
          detail:
            "This check sends crafted query values. It stays off until you opt in on the scan form.",
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
          id: "injection-probe",
          severity: "info",
          title: "Could not start injection probe",
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

    const endpoints = candidateEndpoints(pageUrl, html);
    const findings: Finding[] = [];
    const payloads = [...SQL_PAYLOADS, ...NOSQL_PAYLOADS];

    for (const endpoint of endpoints) {
      for (const payload of payloads) {
        try {
          const u = new URL(endpoint);
          u.searchParams.set("id", payload);
          u.searchParams.set("q", payload);
          const res = await fetchWithLimits(
            u.toString(),
            {},
            { timeoutMs: 8000, maxBytes: 200_000 }
          );
          if (ERROR_HINTS.test(res.body)) {
            findings.push({
              id: "injection-probe",
              severity: "critical",
              title: "Possible injection — database error reflected",
              location: u.pathname,
              detail:
                "A non-destructive test value triggered what looks like a database/ORM error message in the response. That often means input is concatenated into a query. We did not run destructive statements.",
              evidence: `Probe param reflected error-like text on ${u.pathname}`,
              fix: {
                type: "prompt",
                content:
                  "Use parameterized queries / ORM bind parameters everywhere — never string-concatenate user input into SQL. For MongoDB, avoid passing raw req.query objects into find(). Return generic errors to clients; log details server-side only.",
              },
            });
            break;
          }
        } catch {
          // skip
        }
      }
    }

    const deduped: Finding[] = [];
    const seen = new Set<string>();
    for (const f of findings) {
      if (seen.has(f.location)) continue;
      seen.add(f.location);
      deduped.push(f);
    }

    if (deduped.length === 0) {
      deduped.push({
        id: "injection-probe",
        severity: "pass",
        title: "No database error leakage from injection probes",
        location: pageUrl.hostname,
        detail: `Tried harmless SQL/NoSQL test strings on ${endpoints.length} endpoint(s). No obvious DB error messages came back.`,
        fix: null,
      });
    }

    return deduped;
  },
};
