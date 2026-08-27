"use client";

import { useState } from "react";
import Link from "next/link";
import type { Finding, OverallVerdict } from "@/lib/types";
import { InspectionReport } from "@/components/inspection-report";

type ScanResponse = {
  id: string | null;
  targetUrl: string;
  verdict: OverallVerdict;
  findings: Finding[];
  completedAt: string;
  error?: string;
};

export function PreviewScanForm() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ScanResponse | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    setLoading(true);

    try {
      const res = await fetch("/api/preview-scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = (await res.json()) as ScanResponse & { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Preview scan failed.");
        return;
      }
      setResult(data);
    } catch {
      setError("Could not reach the scanner. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="blueprint-border bg-surface p-5 sm:p-6">
        <label htmlFor="preview-url" className="text-label text-ink-soft">
          Try a free preview scan
        </label>
        <p className="mt-1 text-sm text-ink-soft">
          No signup. We run 4 read-only checks (keys, Supabase access, headers,
          CORS) so you can see how the report reads.
        </p>
        <form
          onSubmit={onSubmit}
          className="mt-4 flex flex-col gap-3 sm:flex-row"
        >
          <input
            id="preview-url"
            name="url"
            type="url"
            required
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://your-app.vercel.app"
            className="blueprint-border flex-1 bg-paper px-3 py-3 text-sm text-ink placeholder:text-ink-soft/60"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || !url.trim()}
            className="blueprint-border bg-ink px-5 py-3 text-sm font-medium text-paper transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "Scanning…" : "Run preview scan"}
          </button>
        </form>
        {error && (
          <p
            role="alert"
            className="mt-3 border border-critical/40 bg-critical/5 px-3 py-2 text-sm text-critical"
          >
            {error}
          </p>
        )}
        <p className="mt-3 font-mono text-xs text-ink-soft">
          Read-only · rate-limited · no credit card
        </p>
      </div>

      {result && (
        <div className="mt-8 space-y-4">
          <InspectionReport
            targetUrl={result.targetUrl}
            verdict={result.verdict}
            findings={result.findings}
            completedAt={result.completedAt}
            preview
          />
          <div className="blueprint-border bg-surface p-4 text-sm text-ink-soft">
            Want the full checklist and scan history?{" "}
            <Link
              href="/signup"
              className="font-medium text-ink underline-offset-2 hover:underline"
            >
              Create a free account
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
