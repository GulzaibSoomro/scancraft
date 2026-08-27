"use client";

import { useState } from "react";
import Link from "next/link";

type Props = {
  projectId: string;
  initialEnabled: boolean;
  nextAutoScanAt?: string | null;
  lastAutoScanAt?: string | null;
  isPro: boolean;
};

export function WeeklyRescanToggle({
  projectId,
  initialEnabled,
  nextAutoScanAt,
  lastAutoScanAt,
  isPro,
}: Props) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [nextAt, setNextAt] = useState(nextAutoScanAt);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle(next: boolean) {
    if (!isPro) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/schedule`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      const data = (await res.json()) as {
        error?: string;
        project?: {
          weekly_rescan_enabled: boolean;
          next_auto_scan_at: string | null;
        };
      };
      if (!res.ok) {
        setError(data.error ?? "Could not update schedule.");
        return;
      }
      setEnabled(!!data.project?.weekly_rescan_enabled);
      setNextAt(data.project?.next_auto_scan_at ?? null);
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="blueprint-border bg-surface p-5">
      <h2 className="text-label text-ink">Weekly re-scan</h2>
      <p className="mt-2 text-sm text-ink-soft">
        Pro can re-check this app every week and alert you when new critical or
        warning findings appear.
      </p>

      {!isPro ? (
        <p className="mt-4 text-sm text-ink-soft">
          <Link href="/pricing" className="font-medium text-ink underline-offset-2 hover:underline">
            Upgrade to Pro
          </Link>{" "}
          to enable scheduled scans.
        </p>
      ) : (
        <label className="mt-4 flex cursor-pointer items-start gap-2 text-sm text-ink">
          <input
            type="checkbox"
            className="mt-1"
            checked={enabled}
            disabled={loading}
            onChange={(e) => void toggle(e.target.checked)}
          />
          <span>Run an automatic full scan every week</span>
        </label>
      )}

      {isPro && enabled && (
        <dl className="mt-3 space-y-1 font-mono text-xs text-ink-soft">
          {lastAutoScanAt && (
            <div>Last auto scan: {new Date(lastAutoScanAt).toLocaleString()}</div>
          )}
          {nextAt && (
            <div>Next scheduled: {new Date(nextAt).toLocaleString()}</div>
          )}
        </dl>
      )}

      {error && (
        <p role="alert" className="mt-2 text-sm text-critical">
          {error}
        </p>
      )}
    </section>
  );
}
