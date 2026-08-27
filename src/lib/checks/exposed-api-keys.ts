import type { CheckModule, Finding } from "@/lib/types";
import { redactSecret } from "@/lib/utils/redact";
import {
  absoluteUrl,
  assertPublicHttpUrl,
  fetchWithLimits,
  normalizeTargetUrl,
} from "@/lib/checks/http";

/**
 * Fetch the HTML page, discover JS bundles, and scan for known secret formats.
 * Publishable/anon keys are info-level; true secrets are critical.
 */

type Pattern = {
  id: string;
  label: string;
  regex: RegExp;
  kind: "secret" | "publishable";
};

const PATTERNS: Pattern[] = [
  {
    id: "openai",
    label: "OpenAI API key",
    regex: /\bsk-[a-zA-Z0-9]{20,}\b/g,
    kind: "secret",
  },
  {
    id: "anthropic",
    label: "Anthropic API key",
    regex: /\bsk-ant-[a-zA-Z0-9\-_]{20,}\b/g,
    kind: "secret",
  },
  {
    id: "stripe-live",
    label: "Stripe live secret key",
    regex: /\bsk_live_[a-zA-Z0-9]{20,}\b/g,
    kind: "secret",
  },
  {
    id: "stripe-test",
    label: "Stripe test secret key",
    regex: /\bsk_test_[a-zA-Z0-9]{20,}\b/g,
    kind: "secret",
  },
  {
    id: "aws",
    label: "AWS access key",
    regex: /\bAKIA[0-9A-Z]{16}\b/g,
    kind: "secret",
  },
  {
    id: "github",
    label: "GitHub token",
    regex: /\bgh[pousr]_[A-Za-z0-9_]{36,}\b/g,
    kind: "secret",
  },
  {
    id: "supabase-service",
    label: "Supabase service_role JWT",
    // JWTs are three base64url segments; we confirm role claim after match.
    regex: /\beyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\b/g,
    kind: "secret",
  },
  {
    id: "stripe-pk",
    label: "Stripe publishable key",
    regex: /\bpk_(live|test)_[a-zA-Z0-9]{20,}\b/g,
    kind: "publishable",
  },
];

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const json = Buffer.from(
      parts[1].replace(/-/g, "+").replace(/_/g, "/"),
      "base64"
    ).toString("utf8");
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function isSupabaseServiceRole(token: string): boolean {
  const payload = decodeJwtPayload(token);
  if (!payload) return false;
  const role = payload.role;
  return role === "service_role";
}

function isLikelySupabaseAnon(token: string): boolean {
  const payload = decodeJwtPayload(token);
  if (!payload) return false;
  return payload.role === "anon";
}

function extractScriptUrls(html: string, pageUrl: string): string[] {
  const urls: string[] = [];
  const scriptSrc = /<script[^>]+src=["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = scriptSrc.exec(html))) {
    const abs = absoluteUrl(pageUrl, m[1]);
    if (abs && /\.(js|mjs)(\?|$)/i.test(abs)) urls.push(abs);
  }
  // Next.js / Vite often embed chunk paths in the HTML as bare "/_next/static/..."
  const nextChunks = html.match(/\/_next\/static\/[^"'\\\s]+\.js/g) ?? [];
  for (const path of nextChunks) {
    const abs = absoluteUrl(pageUrl, path);
    if (abs) urls.push(abs);
  }
  return Array.from(new Set(urls)).slice(0, 25);
}

function scanText(
  text: string,
  location: string
): Finding[] {
  const findings: Finding[] = [];
  const seen = new Set<string>();

  for (const pattern of PATTERNS) {
    pattern.regex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.regex.exec(text))) {
      const value = match[0];

      if (pattern.id === "supabase-service") {
        if (isLikelySupabaseAnon(value)) continue;
        if (!isSupabaseServiceRole(value)) continue;
      }

      // Avoid flagging OpenAI-like matches that are actually Anthropic (already covered)
      if (pattern.id === "openai" && value.startsWith("sk-ant-")) continue;

      const key = `${pattern.id}:${value.slice(0, 12)}`;
      if (seen.has(key)) continue;
      seen.add(key);

      if (pattern.kind === "secret") {
        findings.push({
          id: "exposed-api-key",
          severity: "critical",
          title: `${pattern.label} found in frontend code`,
          location,
          detail:
            "A secret key is sitting in JavaScript that any visitor can download. Attackers can copy it and use your paid APIs, empty your Stripe account, or (for a Supabase service_role key) read and change your entire database — bypassing Row Level Security.",
          evidence: redactSecret(value, 6),
          fix: {
            type: "prompt",
            content: `Move the ${pattern.label} out of all client-side code. Store it only in server environment variables (never NEXT_PUBLIC_* / VITE_*). Add an API route or server action that calls the third-party service, and have the browser call that route instead. Rotate the exposed key immediately in the provider dashboard — treat it as compromised.`,
          },
        });
      } else {
        findings.push({
          id: "exposed-publishable-key",
          severity: "info",
          title: `${pattern.label} visible in frontend (expected)`,
          location,
          detail:
            "Publishable keys are meant for the browser, so this isn’t a secret leak by itself. Just make sure you’re not also shipping a secret/live key, and that Stripe/webhook secrets stay server-only.",
          evidence: redactSecret(value, 6),
          fix: null,
        });
      }
    }
  }

  return findings;
}

export const exposedApiKeysCheck: CheckModule = {
  id: "exposed-api-key",
  name: "Exposed API keys in frontend bundles",
  description:
    "Downloads public JS and looks for secret key formats that should never ship to the browser.",
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
          id: "exposed-api-key",
          severity: "info",
          title: "Could not start key scan",
          location: ctx.targetUrl,
          detail: err instanceof Error ? err.message : "Invalid URL",
          fix: null,
        },
      ];
    }

    let html: string;
    try {
      const page = await fetchWithLimits(pageUrl.toString());
      html = page.body;
      findings.push(...scanText(html, pageUrl.pathname || "/"));
    } catch {
      return [
        {
          id: "exposed-api-key",
          severity: "warning",
          title: "Could not fetch the site homepage",
          location: pageUrl.toString(),
          detail:
            "We couldn’t download the page to look for leaked keys. The site may be down, blocking bots, or requiring a VPN.",
          fix: {
            type: "manual",
            content:
              "Confirm the URL loads in a private browser window, then re-run the scan.",
          },
        },
      ];
    }

    const scriptUrls = extractScriptUrls(html, pageUrl.toString());
    const results = await Promise.allSettled(
      scriptUrls.map(async (scriptUrl) => {
        const res = await fetchWithLimits(scriptUrl, {}, { maxBytes: 1_500_000 });
        return scanText(res.body, new URL(scriptUrl).pathname);
      })
    );

    for (const result of results) {
      if (result.status === "fulfilled") findings.push(...result.value);
    }

    if (!findings.some((f) => f.severity === "critical")) {
      findings.push({
        id: "exposed-api-key",
        severity: "pass",
        title: "No secret API keys found in sampled frontend code",
        location: pageUrl.hostname,
        detail:
          "We scanned the homepage HTML and up to 25 linked JavaScript files for common secret formats. Nothing critical showed up in that sample — good. This isn’t a guarantee for every dynamic chunk, but it’s a strong signal.",
        fix: null,
      });
    }

    return findings;
  },
};
