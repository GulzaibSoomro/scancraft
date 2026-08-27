import type { CheckModule, Finding } from "@/lib/types";
import {
  absoluteUrl,
  assertPublicHttpUrl,
  fetchWithLimits,
  normalizeTargetUrl,
} from "@/lib/checks/http";

const SERVER_HINTS =
  /(?:\/(?:api|server|pages\/api|app\/api)\/|node_modules\/next\/dist\/server|createServer|getServerSideProps|process\.env\.(?:(?!NEXT_PUBLIC)[A-Z0-9_]+)|DATABASE_URL|SECRET_KEY|SERVICE_ROLE)/i;

function extractScriptUrls(html: string, pageUrl: string): string[] {
  const urls: string[] = [];
  const scriptSrc = /<script[^>]+src=["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = scriptSrc.exec(html))) {
    const abs = absoluteUrl(pageUrl, m[1]);
    if (abs && /\.(js|mjs)(\?|$)/i.test(abs)) urls.push(abs);
  }
  const nextChunks = html.match(/\/_next\/static\/[^"'\\\s]+\.js/g) ?? [];
  for (const path of nextChunks) {
    const abs = absoluteUrl(pageUrl, path);
    if (abs) urls.push(abs);
  }
  return Array.from(new Set(urls)).slice(0, 20);
}

function mapUrlsFromJs(js: string, scriptUrl: string): string[] {
  const maps: string[] = [];
  const re = /\/\/[#@]\s*sourceMappingURL\s*=\s*(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(js))) {
    const abs = absoluteUrl(scriptUrl, m[1].trim());
    if (abs) maps.push(abs);
  }
  // Heuristic: same path + .map
  if (/\.js(\?|$)/i.test(scriptUrl)) {
    maps.push(scriptUrl.replace(/\.js(\?|$)/i, ".js.map$1"));
  }
  return Array.from(new Set(maps));
}

export const sourceMapsCheck: CheckModule = {
  id: "source-maps",
  name: "Public source maps",
  description:
    "Looks for downloadable .map files that may expose server-side source.",
  requiresConsent: false,
  async run(ctx) {
    let pageUrl: URL;
    try {
      pageUrl = normalizeTargetUrl(ctx.targetUrl);
      assertPublicHttpUrl(pageUrl);
    } catch (err) {
      return [
        {
          id: "source-maps",
          severity: "info",
          title: "Could not start source map check",
          location: ctx.targetUrl,
          detail: err instanceof Error ? err.message : "Invalid URL",
          fix: null,
        },
      ];
    }

    const findings: Finding[] = [];
    let html = "";
    try {
      html = (await fetchWithLimits(pageUrl.toString())).body;
    } catch {
      return [
        {
          id: "source-maps",
          severity: "warning",
          title: "Could not fetch site for source map check",
          location: pageUrl.toString(),
          detail: "Homepage request failed.",
          fix: null,
        },
      ];
    }

    const scripts = extractScriptUrls(html, pageUrl.toString());
    const mapCandidates = new Set<string>();

    await Promise.all(
      scripts.map(async (scriptUrl) => {
        try {
          const res = await fetchWithLimits(scriptUrl, {}, { maxBytes: 800_000 });
          for (const m of mapUrlsFromJs(res.body, scriptUrl)) {
            mapCandidates.add(m);
          }
        } catch {
          // skip
        }
      })
    );

    const maps = Array.from(mapCandidates).slice(0, 15);
    let exposedServerish = 0;

    for (const mapUrl of maps) {
      try {
        const res = await fetchWithLimits(
          mapUrl,
          {},
          { timeoutMs: 8000, maxBytes: 1_500_000 }
        );
        if (res.status !== 200) continue;
        let parsed: { sources?: string[]; mappings?: string } | null = null;
        try {
          parsed = JSON.parse(res.body) as { sources?: string[]; mappings?: string };
        } catch {
          continue;
        }
        if (!parsed?.sources && !parsed?.mappings) continue;

        const sources = (parsed.sources ?? []).join("\n");
        const combined = `${sources}\n${res.body.slice(0, 50_000)}`;
        const path = new URL(mapUrl).pathname;

        if (SERVER_HINTS.test(combined)) {
          exposedServerish += 1;
          findings.push({
            id: "source-maps",
            severity: "warning",
            title: "Source map may expose server-side code",
            location: path,
            detail:
              "A public .map file looks like it includes server paths or secret-related source. Source maps help debugging in production but can reveal how your backend works — and sometimes leak env var names — to anyone who downloads them.",
            evidence: `Public map at ${path}; sources hint at server/API code`,
            fix: {
              type: "manual",
              content:
                "Disable production source maps (Next.js: productionBrowserSourceMaps: false; Vite: build.sourcemap: false) or block *.map at the CDN. Keep maps only on staging.",
            },
          });
        } else {
          findings.push({
            id: "source-maps",
            severity: "info",
            title: "Source map is publicly downloadable",
            location: path,
            detail:
              "A .map file is public. We didn’t see obvious server-only paths in the sample, but shipping maps in production still helps attackers read your client logic more easily.",
            evidence: `GET ${path} → 200`,
            fix: {
              type: "manual",
              content:
                "Prefer turning off production source maps unless you have a strong reason to keep them.",
            },
          });
        }
      } catch {
        // skip
      }
    }

    if (findings.length === 0) {
      findings.push({
        id: "source-maps",
        severity: "pass",
        title: "No public source maps found in sampled JS",
        location: pageUrl.hostname,
        detail: `Checked ${scripts.length} script(s) for sourceMappingURL / sibling .map files. None were publicly readable in this sample.`,
        fix: null,
      });
    }

    void exposedServerish;
    return findings;
  },
};
