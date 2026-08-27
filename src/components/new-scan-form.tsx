"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Platform } from "@/lib/types";

const PLATFORMS: { value: Platform; label: string }[] = [
  { value: "lovable", label: "Lovable" },
  { value: "bolt", label: "Bolt" },
  { value: "cursor", label: "Cursor" },
  { value: "v0", label: "v0" },
  { value: "replit", label: "Replit" },
  { value: "other", label: "Other / not sure" },
];

type Props = {
  tier?: "free" | "pro";
  defaultUrl?: string;
  projectId?: string;
};

export function NewScanForm({ tier = "free", defaultUrl = "", projectId }: Props) {
  const router = useRouter();
  const [url, setUrl] = useState(defaultUrl);
  const [name, setName] = useState("");
  const [platform, setPlatform] = useState<Platform | "">("");
  const [githubRepoUrl, setGithubRepoUrl] = useState("");
  const [consentActiveProbes, setConsentActiveProbes] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/scans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: projectId ? undefined : url,
          projectId,
          name: name.trim() || undefined,
          platform: platform || undefined,
          githubRepoUrl: githubRepoUrl.trim() || undefined,
          consentActiveProbes,
        }),
      });
      const data = (await res.json()) as {
        scanId?: string;
        error?: string;
        consentActiveProbes?: boolean;
      };

      if (!res.ok || !data.scanId) {
        setError(data.error ?? "Could not start scan.");
        return;
      }

      const q = consentActiveProbes ? "?consent=1" : "";
      router.push(`/dashboard/scans/${data.scanId}${q}`);
    } catch {
      setError("Network error — try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {!projectId && (
        <>
          <div>
            <label htmlFor="scan-url" className="text-label text-ink-soft">
              Deployed app URL
            </label>
            <input
              id="scan-url"
              type="url"
              required
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://your-app.vercel.app"
              className="blueprint-border mt-1.5 w-full bg-paper px-3 py-2.5 text-sm text-ink"
              disabled={loading}
            />
          </div>

          <div>
            <label htmlFor="scan-name" className="text-label text-ink-soft">
              Project name <span className="normal-case tracking-normal">(optional)</span>
            </label>
            <input
              id="scan-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Defaults to the hostname"
              className="blueprint-border mt-1.5 w-full bg-paper px-3 py-2.5 text-sm text-ink"
              disabled={loading}
            />
          </div>
        </>
      )}

      <div>
        <label htmlFor="scan-platform" className="text-label text-ink-soft">
          Built with
        </label>
        <select
          id="scan-platform"
          value={platform}
          onChange={(e) => setPlatform(e.target.value as Platform | "")}
          className="blueprint-border mt-1.5 w-full bg-paper px-3 py-2.5 text-sm text-ink"
          disabled={loading || !!projectId}
        >
          <option value="">Not sure / skip</option>
          {PLATFORMS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-ink-soft">
          Helps us prioritize checks that AI tools for that platform often miss.
        </p>
      </div>

      {!projectId && (
        <div>
          <label htmlFor="scan-github" className="text-label text-ink-soft">
            GitHub repo URL <span className="normal-case tracking-normal">(optional)</span>
          </label>
          <input
            id="scan-github"
            type="url"
            value={githubRepoUrl}
            onChange={(e) => setGithubRepoUrl(e.target.value)}
            placeholder="https://github.com/you/your-app"
            className="blueprint-border mt-1.5 w-full bg-paper px-3 py-2.5 text-sm text-ink"
            disabled={loading}
          />
          <p className="mt-1 text-xs text-ink-soft">
            Saved for later deeper checks. Repo OAuth access comes in a following phase.
          </p>
        </div>
      )}

      <fieldset className="blueprint-border bg-paper/60 p-4">
        <legend className="text-label px-1 text-ink">Active probes</legend>
        <p className="text-sm text-ink-soft">
          Default checks are read-only. With consent we also run non-destructive
          XSS and SQL/NoSQL injection probes (harmless markers only — nothing that
          deletes or changes your data).
        </p>
        <label className="mt-3 flex cursor-pointer items-start gap-2 text-sm text-ink">
          <input
            type="checkbox"
            className="mt-1"
            checked={consentActiveProbes}
            onChange={(e) => setConsentActiveProbes(e.target.checked)}
            disabled={loading}
          />
          <span>
            I own this app (or have permission to test it) and allow ScanCraft to
            run those active probes.
          </span>
        </label>
      </fieldset>

      {tier === "free" && (
        <p className="font-mono text-xs text-ink-soft">
          Free tier: 1 full scan / month · unlimited homepage previews
        </p>
      )}

      {error && (
        <p
          role="alert"
          className="border border-critical/40 bg-critical/5 px-3 py-2 text-sm text-critical"
        >
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading || (!projectId && !url.trim())}
        className="blueprint-border bg-ink px-5 py-2.5 text-sm font-medium text-paper transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {loading ? "Queueing…" : projectId ? "Re-scan this project" : "Start full scan"}
      </button>
    </form>
  );
}
