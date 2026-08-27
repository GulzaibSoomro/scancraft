import type { CheckModule, Finding } from "@/lib/types";
import {
  absoluteUrl,
  assertPublicHttpUrl,
  fetchWithLimits,
  normalizeTargetUrl,
} from "@/lib/checks/http";

const COMMON_PATHS = [
  "/admin",
  "/admin/login",
  "/administrator",
  "/dashboard",
  "/dashboard/admin",
  "/api/admin",
  "/api/admin/users",
  "/manage",
  "/console",
  "/settings/admin",
];

async function discoverPaths(pageUrl: URL): Promise<string[]> {
  const found = new Set<string>(COMMON_PATHS);

  try {
    const robots = await fetchWithLimits(
      new URL("/robots.txt", pageUrl).toString(),
      {},
      { timeoutMs: 6000, maxBytes: 50_000 }
    );
    if (robots.status === 200) {
      const paths = robots.body.match(/\/[A-Za-z0-9_\-/.]+/g) ?? [];
      for (const p of paths) {
        if (/admin|dashboard|manage|internal|private/i.test(p)) {
          found.add(p.split("?")[0]);
        }
      }
    }
  } catch {
    // ignore
  }

  try {
    const sm = await fetchWithLimits(
      new URL("/sitemap.xml", pageUrl).toString(),
      {},
      { timeoutMs: 6000, maxBytes: 200_000 }
    );
    if (sm.status === 200) {
      const locs = sm.body.match(/<loc>([^<]+)<\/loc>/gi) ?? [];
      for (const loc of locs.slice(0, 40)) {
        const raw = loc.replace(/<\/?loc>/gi, "");
        try {
          const u = new URL(raw);
          if (u.hostname === pageUrl.hostname && /admin|dashboard/i.test(u.pathname)) {
            found.add(u.pathname);
          }
        } catch {
          // skip
        }
      }
    }
  } catch {
    // ignore
  }

  return Array.from(found).slice(0, 20);
}

function looksLikeAppShell(body: string, status: number): boolean {
  if (status !== 200) return false;
  if (body.length < 400) return false;
  if (/sign\s*in|log\s*in|unauthorized|forbidden|access denied/i.test(body) &&
      body.length < 2500) {
    return false;
  }
  // SPA shells often return 200 for all routes — flag only if admin-ish copy appears
  return /admin|users|moderation|manage|dashboard/i.test(body);
}

export const adminRoutesCheck: CheckModule = {
  id: "admin-routes",
  name: "Admin routes without auth",
  description:
    "Probes common admin/dashboard paths for unauthenticated content.",
  requiresConsent: false,
  async run(ctx) {
    let pageUrl: URL;
    try {
      pageUrl = normalizeTargetUrl(ctx.targetUrl);
      assertPublicHttpUrl(pageUrl);
    } catch (err) {
      return [
        {
          id: "admin-routes",
          severity: "info",
          title: "Could not start admin route check",
          location: ctx.targetUrl,
          detail: err instanceof Error ? err.message : "Invalid URL",
          fix: null,
        },
      ];
    }

    const paths = await discoverPaths(pageUrl);
    const findings: Finding[] = [];

    for (const path of paths) {
      const url = absoluteUrl(pageUrl.toString(), path);
      if (!url) continue;
      try {
        const res = await fetchWithLimits(
          url,
          { redirect: "manual" },
          { timeoutMs: 8000, maxBytes: 300_000 }
        );

        // Redirect to login is healthy
        if ([301, 302, 303, 307, 308].includes(res.status)) {
          const loc = res.headers.get("location") ?? "";
          if (/login|signin|auth|sign-in/i.test(loc)) continue;
        }
        if (res.status === 401 || res.status === 403) continue;

        if (looksLikeAppShell(res.body, res.status)) {
          findings.push({
            id: "admin-routes",
            severity: "critical",
            title: `Possible unprotected admin/dashboard path (${path})`,
            location: path,
            detail:
              "This path returned real page content without asking us to log in. If it’s a true admin area, strangers could see or change privileged data. (Some SPAs always return 200 — verify this route in a private window.)",
            evidence: `Unauthenticated GET ${path} → ${res.status}, body length ${res.body.length}`,
            fix: {
              type: "prompt",
              content: `Protect ${path} with a server-side auth check (middleware or layout that verifies the session). Do not rely only on hiding links in the React UI — call requireUser()/getSession() on the server and redirect unauthenticated users to login. Also lock down any /api/* routes this page uses.`,
            },
          });
        }
      } catch {
        // skip
      }
    }

    if (findings.length === 0) {
      findings.push({
        id: "admin-routes",
        severity: "pass",
        title: "Common admin paths not serving open content",
        location: pageUrl.hostname,
        detail: `Probed ${paths.length} admin/dashboard-style paths (plus robots/sitemap hints). None returned an obvious unauthenticated admin shell.`,
        fix: null,
      });
    }

    return findings;
  },
};
