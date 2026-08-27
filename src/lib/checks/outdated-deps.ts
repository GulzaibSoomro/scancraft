import type { CheckModule, Finding } from "@/lib/types";

type OsvVulnerability = {
  id?: string;
  summary?: string;
  database_specific?: { severity?: string };
  severity?: { type?: string; score?: string }[];
};

function parseGithubRepo(url: string): { owner: string; repo: string } | null {
  try {
    const u = new URL(url);
    if (!["github.com", "www.github.com"].includes(u.hostname)) return null;
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts.length < 2) return null;
    return { owner: parts[0], repo: parts[1].replace(/\.git$/, "") };
  } catch {
    return null;
  }
}

async function fetchPackageJson(
  owner: string,
  repo: string
): Promise<{ path: string; deps: Record<string, string> } | null> {
  const candidates = ["package.json", "frontend/package.json", "web/package.json", "app/package.json"];
  for (const path of candidates) {
    try {
      const res = await fetch(
        `https://raw.githubusercontent.com/${owner}/${repo}/HEAD/${path}`,
        {
          headers: { "User-Agent": "ScanCraftBot/0.1" },
          signal: AbortSignal.timeout(10000),
        }
      );
      if (!res.ok) continue;
      const json = (await res.json()) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      const deps = {
        ...(json.dependencies ?? {}),
        ...(json.devDependencies ?? {}),
      };
      if (Object.keys(deps).length === 0) continue;
      return { path, deps };
    } catch {
      // try next
    }
  }
  return null;
}

function normalizeVersion(range: string): string | null {
  const cleaned = range.replace(/^[^0-9]*/, "");
  const m = cleaned.match(/^(\d+\.\d+\.\d+)/);
  return m ? m[1] : null;
}

async function queryOsv(
  name: string,
  version: string
): Promise<OsvVulnerability[]> {
  try {
    const res = await fetch("https://api.osv.dev/v1/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        package: { name, ecosystem: "npm" },
        version,
      }),
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { vulns?: OsvVulnerability[] };
    return data.vulns ?? [];
  } catch {
    return [];
  }
}

export const outdatedDepsCheck: CheckModule = {
  id: "outdated-dependencies",
  name: "Outdated dependencies (OSV)",
  description:
    "For public GitHub repos, reads package.json and checks the OSV vulnerability DB.",
  requiresConsent: false,
  requiresRepo: true,
  async run(ctx) {
    if (!ctx.githubRepoUrl) {
      return [
        {
          id: "outdated-dependencies",
          severity: "info",
          title: "Dependency check skipped (no GitHub repo)",
          location: ctx.targetUrl,
          detail: "Add a public GitHub repo URL on the project to enable this check.",
          fix: null,
        },
      ];
    }

    const parsed = parseGithubRepo(ctx.githubRepoUrl);
    if (!parsed) {
      return [
        {
          id: "outdated-dependencies",
          severity: "info",
          title: "Could not parse GitHub repo URL",
          location: ctx.githubRepoUrl,
          detail: "Expected https://github.com/owner/repo",
          fix: null,
        },
      ];
    }

    const pkg = await fetchPackageJson(parsed.owner, parsed.repo);
    if (!pkg) {
      return [
        {
          id: "outdated-dependencies",
          severity: "info",
          title: "package.json not readable from GitHub",
          location: ctx.githubRepoUrl,
          detail:
            "Repo may be private, or package.json isn’t at the root. Private repos need GitHub OAuth (coming later).",
          fix: null,
        },
      ];
    }

    const entries = Object.entries(pkg.deps).slice(0, 40);
    const findings: Finding[] = [];

    // Limit concurrency
    const batchSize = 5;
    for (let i = 0; i < entries.length; i += batchSize) {
      const batch = entries.slice(i, i + batchSize);
      const results = await Promise.all(
        batch.map(async ([name, range]) => {
          const version = normalizeVersion(range);
          if (!version) return null;
          const vulns = await queryOsv(name, version);
          return { name, version, vulns };
        })
      );

      for (const r of results) {
        if (!r || r.vulns.length === 0) continue;
        const top = r.vulns[0];
        const sev =
          top.database_specific?.severity?.toUpperCase() === "CRITICAL"
            ? "critical"
            : "warning";
        findings.push({
          id: "outdated-dependencies",
          severity: sev,
          title: `Known vulnerability in ${r.name}@${r.version}`,
          location: `${pkg.path} → ${r.name}`,
          detail: `${top.summary ?? "Listed in the OSV database."} (${top.id ?? "OSV"}) Update this package when you can — AI scaffolds often pin old versions.`,
          evidence: `${top.id ?? "osv"} · ${r.vulns.length} issue(s) for ${r.name}@${r.version}`,
          fix: {
            type: "prompt",
            content: `Update the npm package "${r.name}" past the vulnerable versions and run npm audit / your lockfile refresh. Prefer the latest patched release compatible with the app.`,
          },
        });
      }
    }

    if (findings.length === 0) {
      findings.push({
        id: "outdated-dependencies",
        severity: "pass",
        title: "No OSV hits in sampled package.json dependencies",
        location: pkg.path,
        detail: `Checked ${entries.length} packages from ${parsed.owner}/${parsed.repo} against OSV. None of the pinned versions we could parse returned vulns (devDependencies included in the sample).`,
        fix: null,
      });
    }

    return findings.slice(0, 25);
  },
};
