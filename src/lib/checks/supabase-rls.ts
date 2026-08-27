import type { CheckModule, Finding } from "@/lib/types";
import { redactSecret } from "@/lib/utils/redact";
import {
  absoluteUrl,
  assertPublicHttpUrl,
  fetchWithLimits,
  normalizeTargetUrl,
} from "@/lib/checks/http";

const COMMON_TABLES = [
  "users",
  "profiles",
  "orders",
  "messages",
  "posts",
  "comments",
  "products",
  "customers",
  "accounts",
  "todos",
  "items",
  "documents",
  "files",
  "subscriptions",
  "payments",
];

type SupabaseConfig = {
  url: string;
  anonKey: string;
};

function findSupabaseConfig(text: string): SupabaseConfig | null {
  const hostMatch = text.match(/https:\/\/([a-z0-9-]+)\.supabase\.co/i);
  if (!hostMatch) return null;

  const projectUrl = `https://${hostMatch[1]}.supabase.co`;

  const jwtMatches =
    text.match(/\beyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\b/g) ??
    [];

  let anonKey: string | null = null;
  for (const token of jwtMatches) {
    const payload = decodeJwtPayload(token);
    if (payload?.role === "anon") {
      anonKey = token;
      break;
    }
  }
  if (!anonKey && jwtMatches[0]) anonKey = jwtMatches[0];

  if (!anonKey) {
    const named = text.match(
      /(?:anon[_-]?key|supabaseAnonKey|NEXT_PUBLIC_SUPABASE_ANON_KEY)["'\s:=]+["']([^"']{40,})["']/i
    );
    if (named) anonKey = named[1];
  }

  if (!anonKey) return null;
  return { url: projectUrl, anonKey };
}

function decodeJwtPayload(token: string): { role?: string } | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const padded = part.replace(/-/g, "+").replace(/_/g, "/");
    const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
    return JSON.parse(Buffer.from(padded + pad, "base64").toString("utf8")) as {
      role?: string;
    };
  } catch {
    return null;
  }
}

function extractScriptUrls(html: string, pageUrl: string): string[] {
  const urls: string[] = [];
  const scriptSrc = /<script[^>]+src=["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = scriptSrc.exec(html))) {
    const abs = absoluteUrl(pageUrl, m[1]);
    if (abs) urls.push(abs);
  }
  const nextChunks = html.match(/\/_next\/static\/[^"'\\\s]+\.js/g) ?? [];
  for (const path of nextChunks) {
    const abs = absoluteUrl(pageUrl, path);
    if (abs) urls.push(abs);
  }
  return Array.from(new Set(urls)).slice(0, 20);
}

async function probeTable(
  config: SupabaseConfig,
  table: string
): Promise<{ table: string; exposed: boolean; sampleCount: number; evidence: string } | null> {
  const endpoint = `${config.url}/rest/v1/${table}?select=*&limit=3`;
  try {
    const res = await fetchWithLimits(
      endpoint,
      {
        headers: {
          apikey: config.anonKey,
          Authorization: `Bearer ${config.anonKey}`,
          Accept: "application/json",
          Prefer: "count=exact",
        },
      },
      { timeoutMs: 8000, maxBytes: 200_000 }
    );

    if (res.status === 404 || res.status === 401 || res.status === 403) {
      return null;
    }
    if (res.status === 200) {
      let rows: unknown[] = [];
      try {
        const parsed = JSON.parse(res.body) as unknown;
        if (Array.isArray(parsed)) rows = parsed;
      } catch {
        return null;
      }
      if (rows.length === 0) {
        // Table exists and is readable but empty — still an RLS gap if SELECT is open.
        return {
          table,
          exposed: true,
          sampleCount: 0,
          evidence: `GET ${endpoint} → 200 with empty array (table readable with anon key)`,
        };
      }
      return {
        table,
        exposed: true,
        sampleCount: rows.length,
        evidence: `GET /rest/v1/${table} → 200, returned ${rows.length} row(s) using only the public anon key`,
      };
    }
    return null;
  } catch {
    return null;
  }
}

export const supabaseRlsCheck: CheckModule = {
  id: "supabase-rls",
  name: "Supabase RLS / open table access",
  description:
    "If the app uses Supabase, tries reading common tables with only the public anon key.",
  requiresConsent: false,
  async run(ctx) {
    const findings: Finding[] = [];
    let pageUrl: URL;
    try {
      pageUrl = normalizeTargetUrl(ctx.targetUrl);
      assertPublicHttpUrl(pageUrl);
    } catch (err) {
      return [
        {
          id: "supabase-rls",
          severity: "info",
          title: "Could not start Supabase check",
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
      const scripts = extractScriptUrls(page.body, pageUrl.toString());
      const bodies = await Promise.allSettled(
        scripts.map((u) => fetchWithLimits(u, {}, { maxBytes: 1_000_000 }))
      );
      for (const b of bodies) {
        if (b.status === "fulfilled") combined += `\n${b.value.body}`;
      }
    } catch {
      return [
        {
          id: "supabase-rls",
          severity: "warning",
          title: "Could not fetch site to detect Supabase",
          location: pageUrl.toString(),
          detail: "Homepage request failed, so we couldn’t look for a Supabase project.",
          fix: null,
        },
      ];
    }

    const config = findSupabaseConfig(combined);
    if (!config) {
      return [
        {
          id: "supabase-rls",
          severity: "info",
          title: "No Supabase project detected in frontend",
          location: pageUrl.hostname,
          detail:
            "We didn’t find a supabase.co URL + anon key in the sampled frontend. If this app doesn’t use Supabase, you can ignore this check. If it does, the config may be loaded dynamically.",
          fix: null,
        },
      ];
    }

    const probes = await Promise.all(
      COMMON_TABLES.map((t) => probeTable(config, t))
    );
    const exposed = probes.filter(
      (p): p is NonNullable<typeof p> => p !== null && p.exposed
    );

    if (exposed.length === 0) {
      findings.push({
        id: "supabase-rls",
        severity: "pass",
        title: "Common Supabase tables not readable with anon key",
        location: config.url,
        detail: `We found a Supabase project (${config.url}) and tried SELECT on common table names using only the public anon key. None returned data. That usually means RLS is blocking anonymous reads — keep it that way for every table.`,
        evidence: `anon key ${redactSecret(config.anonKey, 6)}`,
        fix: null,
      });
      return findings;
    }

    for (const hit of exposed) {
      findings.push({
        id: "supabase-rls",
        severity: "critical",
        title: `Supabase table "${hit.table}" readable without login`,
        location: `${config.url}/rest/v1/${hit.table}`,
        detail:
          "Anyone who copies your public anon key (it’s in your frontend by design) can read this table through Supabase’s auto-generated REST API. If Row Level Security (RLS) isn’t on — or a policy says “allow all” — private user data can leak. This is one of the most common issues in Lovable/Bolt apps.",
        evidence: hit.evidence,
        fix: {
          type: "prompt",
          content: `Enable Row Level Security on the "${hit.table}" table in Supabase, and replace any open policies. Example policy for user-owned rows:\n\nALTER TABLE ${hit.table} ENABLE ROW LEVEL SECURITY;\n\nCREATE POLICY "Users read own rows" ON ${hit.table}\n  FOR SELECT TO authenticated\n  USING (auth.uid() = user_id);\n\nDo not use USING (true) for SELECT on sensitive data. Verify with the anon key that unauthenticated SELECTs return empty/403.`,
        },
      });
    }

    return findings;
  },
};
