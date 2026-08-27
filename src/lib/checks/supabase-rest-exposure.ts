import type { CheckModule, Finding } from "@/lib/types";
import { redactSecret } from "@/lib/utils/redact";
import {
  absoluteUrl,
  assertPublicHttpUrl,
  fetchWithLimits,
  normalizeTargetUrl,
} from "@/lib/checks/http";

/**
 * Focuses on PostgREST surface: OpenAPI schema leak + direct /rest/v1/<table> probes.
 * Complements supabase-rls (which emphasizes policy/data exposure).
 */

type SupabaseConfig = { url: string; anonKey: string };

function findConfig(text: string): SupabaseConfig | null {
  const hostMatch = text.match(/https:\/\/([a-z0-9-]+)\.supabase\.co/i);
  if (!hostMatch) return null;
  const url = `https://${hostMatch[1]}.supabase.co`;
  const jwtMatches =
    text.match(/\beyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\b/g) ??
    [];
  let anonKey = jwtMatches[0] ?? null;
  for (const token of jwtMatches) {
    try {
      const payload = JSON.parse(
        Buffer.from(
          token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"),
          "base64"
        ).toString("utf8")
      ) as { role?: string };
      if (payload.role === "anon") {
        anonKey = token;
        break;
      }
    } catch {
      // continue
    }
  }
  if (!anonKey) return null;
  return { url, anonKey };
}

function extractScripts(html: string, pageUrl: string): string[] {
  const urls: string[] = [];
  const re = /<script[^>]+src=["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const abs = absoluteUrl(pageUrl, m[1]);
    if (abs) urls.push(abs);
  }
  return Array.from(new Set(urls)).slice(0, 15);
}

const TABLES = [
  "users",
  "profiles",
  "orders",
  "messages",
  "posts",
  "products",
  "customers",
];

export const supabaseRestExposureCheck: CheckModule = {
  id: "supabase-rest-exposure",
  name: "Supabase REST API exposure",
  description:
    "Probes PostgREST OpenAPI and /rest/v1 tables with the public anon key.",
  requiresConsent: false,
  async run(ctx) {
    let pageUrl: URL;
    try {
      pageUrl = normalizeTargetUrl(ctx.targetUrl);
      assertPublicHttpUrl(pageUrl);
    } catch (err) {
      return [
        {
          id: "supabase-rest-exposure",
          severity: "info",
          title: "Could not start Supabase REST check",
          location: ctx.targetUrl,
          detail: err instanceof Error ? err.message : "Invalid URL",
          fix: null,
        },
      ];
    }

    let combined = "";
    try {
      const page = await fetchWithLimits(pageUrl.toString());
      combined += page.body;
      const scripts = extractScripts(page.body, pageUrl.toString());
      const bodies = await Promise.allSettled(
        scripts.map((u) => fetchWithLimits(u, {}, { maxBytes: 800_000 }))
      );
      for (const b of bodies) {
        if (b.status === "fulfilled") combined += `\n${b.value.body}`;
      }
    } catch {
      return [
        {
          id: "supabase-rest-exposure",
          severity: "info",
          title: "Could not fetch site for Supabase REST check",
          location: pageUrl.toString(),
          detail: "Homepage request failed.",
          fix: null,
        },
      ];
    }

    const config = findConfig(combined);
    if (!config) {
      return [
        {
          id: "supabase-rest-exposure",
          severity: "info",
          title: "No Supabase REST target detected",
          location: pageUrl.hostname,
          detail: "No supabase.co project URL + anon JWT found in the frontend sample.",
          fix: null,
        },
      ];
    }

    const findings: Finding[] = [];
    const headers = {
      apikey: config.anonKey,
      Authorization: `Bearer ${config.anonKey}`,
      Accept: "application/openapi+json, application/json",
    };

    // OpenAPI / schema enumeration
    try {
      const openapi = await fetchWithLimits(
        `${config.url}/rest/v1/`,
        { headers },
        { timeoutMs: 8000, maxBytes: 500_000 }
      );
      if (openapi.status === 200 && /"paths"|openapi|swagger/i.test(openapi.body)) {
        const tableHints =
          openapi.body.match(/\/([a-zA-Z_][a-zA-Z0-9_]*)"\s*:/g)?.length ?? 0;
        findings.push({
          id: "supabase-rest-exposure",
          severity: "warning",
          title: "Supabase REST OpenAPI schema is publicly readable",
          location: `${config.url}/rest/v1/`,
          detail:
            "Anyone with your anon key (it’s in the browser) can download the auto-generated API schema and learn every table and column name. That makes targeted attacks easier. Pair this with tight RLS so knowing the shape still doesn’t leak rows.",
          evidence: `OpenAPI/HTTP 200 from /rest/v1/ (anon ${redactSecret(config.anonKey, 4)}; ~${tableHints} path-like entries)`,
          fix: {
            type: "manual",
            content:
              "You can’t fully hide PostgREST’s schema from anon users who hold the key. Mitigate by enabling RLS on every table, exposing only needed columns via views, and never putting privileged data in anon-readable relations.",
          },
        });
      }
    } catch {
      // ignore
    }

    // Direct table probes (attack vector used in real incidents)
    for (const table of TABLES) {
      try {
        const endpoint = `${config.url}/rest/v1/${table}?select=*&limit=1`;
        const res = await fetchWithLimits(
          endpoint,
          {
            headers: {
              ...headers,
              Accept: "application/json",
              Prefer: "count=exact",
            },
          },
          { timeoutMs: 8000, maxBytes: 100_000 }
        );
        if (res.status !== 200) continue;
        let rows: unknown[] = [];
        try {
          const parsed = JSON.parse(res.body) as unknown;
          if (Array.isArray(parsed)) rows = parsed;
        } catch {
          continue;
        }
        const contentRange = res.headers.get("content-range");
        findings.push({
          id: "supabase-rest-exposure",
          severity: "critical",
          title: `Supabase REST endpoint /${table} readable anonymously`,
          location: `/rest/v1/${table}`,
          detail:
            "This is the literal URL attackers hit after copying your anon key from the frontend bundle. Even one readable row (or an empty 200) means the table is exposed through PostgREST — enable RLS and deny anon SELECT.",
          evidence: `GET /rest/v1/${table} → 200, rows=${rows.length}${contentRange ? `, Content-Range: ${contentRange}` : ""}`,
          fix: {
            type: "code",
            content: `ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;\n\n-- Example: no anon access\nCREATE POLICY "deny anon select" ON ${table}\n  FOR SELECT TO anon\n  USING (false);\n\n-- Authenticated users: only own rows\nCREATE POLICY "own rows" ON ${table}\n  FOR SELECT TO authenticated\n  USING (auth.uid() = user_id);`,
          },
        });
      } catch {
        // skip
      }
    }

    if (findings.length === 0) {
      findings.push({
        id: "supabase-rest-exposure",
        severity: "pass",
        title: "Supabase REST probes did not return open table data",
        location: config.url,
        detail:
          "Found a Supabase project; common /rest/v1 tables didn’t return readable rows with the anon key, and OpenAPI wasn’t clearly exposed in a useful form.",
        fix: null,
      });
    }

    return findings;
  },
};
