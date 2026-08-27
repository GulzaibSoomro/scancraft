"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Finding, OverallVerdict, ScanStatus } from "@/lib/types";
import { InspectionReport } from "@/components/inspection-report";
import { NewScanForm } from "@/components/new-scan-form";

type ScanPayload = {
  id: string;
  status: ScanStatus;
  verdict: OverallVerdict | null;
  errorMessage: string | null;
  completedAt: string | null;
  project: {
    id: string;
    name: string;
    deployedUrl: string;
    platform: string | null;
  };
  findings: Finding[];
};

export function ScanStatusClient({
  scanId,
  consentActiveProbes,
  canExportPdf = false,
}: {
  scanId: string;
  consentActiveProbes: boolean;
  canExportPdf?: boolean;
}) {
  const [scan, setScan] = useState<ScanPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showRescan, setShowRescan] = useState(false);
  const runStarted = useRef(false);

  const fetchStatus = useCallback(async () => {
    const res = await fetch(`/api/scans/${scanId}`);
    const data = (await res.json()) as ScanPayload & { error?: string };
    if (!res.ok) {
      setError(data.error ?? "Could not load scan.");
      return null;
    }
    setScan(data);
    setError(null);
    return data;
  }, [scanId]);

  const startRun = useCallback(async () => {
    const res = await fetch(`/api/scans/${scanId}/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ consentActiveProbes }),
    });
    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      setError(data.error ?? "Scan failed to run.");
    }
    await fetchStatus();
  }, [scanId, consentActiveProbes, fetchStatus]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | undefined;

    async function boot() {
      const data = await fetchStatus();
      if (cancelled || !data) return;

      if (data.status === "queued" && !runStarted.current) {
        runStarted.current = true;
        void startRun();
      }

      if (data.status === "complete" || data.status === "failed") return;

      timer = setInterval(async () => {
        const latest = await fetchStatus();
        if (
          latest &&
          (latest.status === "complete" || latest.status === "failed")
        ) {
          if (timer) clearInterval(timer);
        }
      }, 2000);
    }

    void boot();

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [fetchStatus, startRun]);

  if (error && !scan) {
    return (
      <div className="blueprint-border border-critical/50 bg-surface p-6">
        <p className="text-critical">{error}</p>
        <Link href="/dashboard" className="mt-4 inline-block text-sm text-ink underline">
          Back to dashboard
        </Link>
      </div>
    );
  }

  if (!scan) {
    return (
      <div className="blueprint-border bg-surface p-8 text-center">
        <p className="text-label text-ink-soft">Loading scan</p>
        <p className="mt-2 text-ink-soft">Fetching status…</p>
      </div>
    );
  }

  if (scan.status === "queued" || scan.status === "running") {
    return (
      <div className="blueprint-border bg-surface p-8 text-center">
        <p className="text-label text-ink-soft">
          {scan.status === "queued" ? "Queued" : "Running"}
        </p>
        <h1 className="mt-2 font-display text-2xl font-bold text-ink">
          Inspecting {scan.project.name}
        </h1>
        <p className="mt-2 font-mono text-xs text-ink-soft">{scan.project.deployedUrl}</p>
        <p className="mt-6 text-sm text-ink-soft">
          Checking keys, databases, headers, CORS, admin paths, and more. Active
          probes run only if you consented. This can take up to a minute.
        </p>
        <div
          className="mx-auto mt-6 h-1 w-40 overflow-hidden bg-grid"
          aria-hidden
        >
          <div className="h-full w-1/2 animate-pulse bg-ink" />
        </div>
        {error && <p className="mt-4 text-sm text-critical">{error}</p>}
      </div>
    );
  }

  if (scan.status === "failed") {
    return (
      <div className="space-y-6">
        <div className="blueprint-border border-critical/40 bg-surface p-6">
          <p className="text-label text-critical">Scan failed</p>
          <h1 className="mt-2 font-display text-2xl font-bold text-ink">
            {scan.project.name}
          </h1>
          <p className="mt-2 text-sm text-ink-soft">
            {scan.errorMessage ?? "Something went wrong while scanning."}
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              href="/dashboard"
              className="blueprint-border inline-block bg-ink px-4 py-2 text-sm text-paper"
            >
              Back to dashboard
            </Link>
            <Link
              href={`/dashboard/projects/${scan.project.id}`}
              className="blueprint-border inline-block bg-surface px-4 py-2 text-sm text-ink"
            >
              Project history
            </Link>
          </div>
        </div>
        <div className="blueprint-border bg-surface p-5">
          <h2 className="text-label text-ink">Try again</h2>
          <div className="mt-4">
            <NewScanForm projectId={scan.project.id} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/dashboard"
          className="text-sm text-ink-soft underline-offset-2 hover:underline"
        >
          ← Dashboard
        </Link>
        <Link
          href={`/dashboard/projects/${scan.project.id}`}
          className="text-sm text-ink underline-offset-2 hover:underline"
        >
          View project history
        </Link>
      </div>

      <InspectionReport
        targetUrl={scan.project.deployedUrl}
        verdict={scan.verdict ?? "secure"}
        findings={scan.findings}
        completedAt={scan.completedAt ?? undefined}
        projectName={scan.project.name}
        platform={scan.project.platform}
        historyHref={`/dashboard/projects/${scan.project.id}`}
        onRescan={() => setShowRescan((v) => !v)}
        canExportPdf={canExportPdf}
      />

      {showRescan && (
        <div className="blueprint-border bg-surface p-5">
          <h2 className="text-label text-ink">Re-scan this project</h2>
          <p className="mt-1 text-sm text-ink-soft">
            Free tier still counts a re-scan toward your monthly allowance.
          </p>
          <div className="mt-4">
            <NewScanForm projectId={scan.project.id} />
          </div>
        </div>
      )}
    </div>
  );
}
