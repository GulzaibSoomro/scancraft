"use client";

import { useMemo, useState } from "react";
import type { Finding, OverallVerdict, Severity } from "@/lib/types";
import {
  downloadMarkdown,
  findingsToMarkdown,
} from "@/lib/export/markdown";
import { downloadFindingsPdf } from "@/lib/export/pdf";
import Link from "next/link";

const SEVERITY_ORDER: Severity[] = ["critical", "warning", "info", "pass"];

const SEVERITY_STYLES: Record<
  Severity,
  { label: string; className: string }
> = {
  critical: { label: "Critical", className: "border-critical text-critical" },
  warning: { label: "Warning", className: "border-warning text-warning" },
  info: { label: "Info", className: "border-ink-soft text-ink-soft" },
  pass: { label: "Pass", className: "border-pass text-pass" },
};

type Props = {
  targetUrl: string;
  verdict: OverallVerdict;
  findings: Finding[];
  completedAt?: string;
  preview?: boolean;
  projectName?: string;
  platform?: string | null;
  onRescan?: () => void;
  historyHref?: string;
  /** Pro tier unlocks PDF export. Markdown stays free. */
  canExportPdf?: boolean;
};

export function InspectionReport({
  targetUrl,
  verdict,
  findings,
  completedAt,
  preview = false,
  projectName,
  platform,
  onRescan,
  historyHref,
  canExportPdf = false,
}: Props) {
  const [filter, setFilter] = useState<Severity | "all">("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  const displayName =
    projectName?.trim() ||
    (() => {
      try {
        return new URL(targetUrl).hostname;
      } catch {
        return targetUrl;
      }
    })();

  const counts = useMemo(() => {
    const c: Record<Severity, number> = {
      critical: 0,
      warning: 0,
      info: 0,
      pass: 0,
    };
    for (const f of findings) c[f.severity] += 1;
    return c;
  }, [findings]);

  const filtered = findings
    .filter((f) => filter === "all" || f.severity === filter)
    .sort(
      (a, b) =>
        SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity)
    );

  const atRisk = verdict === "at_risk";

  function exportMd() {
    const md = findingsToMarkdown({
      projectName: displayName,
      targetUrl,
      platform,
      verdict,
      findings,
      completedAt,
      preview,
    });
    const safe = displayName.replace(/[^\w.-]+/g, "_").slice(0, 60);
    downloadMarkdown(`scancraft-${safe}`, md);
  }

  async function copyMd() {
    const md = findingsToMarkdown({
      projectName: displayName,
      targetUrl,
      platform,
      verdict,
      findings,
      completedAt,
      preview,
    });
    try {
      await navigator.clipboard.writeText(md);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback: download
      exportMd();
    }
  }

  function exportPdf() {
    setPdfError(null);
    if (!canExportPdf) {
      setPdfError("PDF export is a Pro feature.");
      return;
    }
    try {
      downloadFindingsPdf({
        projectName: displayName,
        targetUrl,
        platform,
        verdict,
        findings,
        completedAt,
        preview,
      });
    } catch {
      setPdfError("Could not build the PDF. Try Markdown export instead.");
    }
  }

  return (
    <div className="blueprint-border bg-surface">
      {/* Architectural title / info strip */}
      <div className="grid gap-4 border-b border-ink p-4 sm:grid-cols-[1fr_auto] sm:items-center sm:p-0">
        <div className="sm:border-r sm:border-ink sm:p-5">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="font-display text-lg font-bold tracking-tight text-ink">
              ScanCraft
            </span>
            <span className="text-label text-ink-soft">Drawing · SEC-AUDIT</span>
          </div>
          <h1 className="mt-2 font-display text-2xl font-bold text-ink sm:text-3xl">
            {displayName}
          </h1>
          <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
            <div>
              <dt className="text-label text-ink-soft">Source URL</dt>
              <dd className="mt-0.5 break-all font-mono text-ink-soft">{targetUrl}</dd>
            </div>
            <div>
              <dt className="text-label text-ink-soft">Platform</dt>
              <dd className="mt-0.5 font-mono text-ink-soft">
                {platform ?? (preview ? "preview" : "n/a")}
              </dd>
            </div>
            <div>
              <dt className="text-label text-ink-soft">Timestamp</dt>
              <dd className="mt-0.5 font-mono text-ink-soft">
                {completedAt
                  ? new Date(completedAt).toLocaleString()
                  : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-label text-ink-soft">Mode</dt>
              <dd className="mt-0.5 font-mono text-ink-soft">
                {preview ? "preview (4 checks)" : "full scan"}
              </dd>
            </div>
          </dl>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:flex-col sm:items-stretch sm:p-4">
          {onRescan && (
            <button
              type="button"
              onClick={onRescan}
              className="blueprint-border bg-ink px-4 py-2 text-sm font-medium text-paper transition-opacity hover:opacity-90"
            >
              Re-scan
            </button>
          )}
          <button
            type="button"
            onClick={exportMd}
            className="blueprint-border bg-surface px-4 py-2 text-sm font-medium text-ink hover:bg-paper"
          >
            Export Markdown
          </button>
          <button
            type="button"
            onClick={() => void copyMd()}
            className="blueprint-border bg-surface px-4 py-2 text-sm font-medium text-ink hover:bg-paper"
          >
            {copied ? "Copied" : "Copy Markdown"}
          </button>
          {canExportPdf ? (
            <button
              type="button"
              onClick={exportPdf}
              className="blueprint-border bg-surface px-4 py-2 text-sm font-medium text-ink hover:bg-paper"
            >
              Export PDF
            </button>
          ) : (
            <Link
              href="/pricing"
              className="blueprint-border bg-surface px-4 py-2 text-center text-sm font-medium text-ink-soft hover:bg-paper"
              title="PDF export is included with Pro"
            >
              PDF · Pro
            </Link>
          )}
          {historyHref && (
            <a
              href={historyHref}
              className="blueprint-border bg-surface px-4 py-2 text-center text-sm font-medium text-ink hover:bg-paper"
            >
              Scan history
            </a>
          )}
          {pdfError && (
            <p role="alert" className="text-xs text-critical">
              {pdfError}
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-col lg:flex-row">
        {/* Left column: stamp + severity + reference */}
        <aside className="border-b border-ink p-4 lg:w-60 lg:shrink-0 lg:border-b-0 lg:border-r">
          <div
            className={`stamp-tilt mx-auto mb-6 w-fit select-none border-2 px-4 py-3 text-center shadow-stamp ${
              atRisk
                ? "border-critical text-critical"
                : "border-pass text-pass"
            }`}
            aria-label={`Verdict: ${atRisk ? "At risk" : "Secure"}`}
          >
            <p className="font-display text-xl font-bold tracking-[0.12em]">
              {atRisk ? "AT RISK" : "SECURE"}
            </p>
            <p className="mt-0.5 text-[10px] font-medium tracking-[0.16em]">
              SCANCRAFT · CERTIFIED
            </p>
          </div>

          <p className="text-label text-ink-soft">Severity</p>
          <ul className="mt-3 space-y-1">
            <li>
              <FilterButton
                active={filter === "all"}
                onClick={() => setFilter("all")}
                label="All"
                count={findings.length}
              />
            </li>
            {SEVERITY_ORDER.map((s) => (
              <li key={s}>
                <FilterButton
                  active={filter === s}
                  onClick={() => setFilter(s)}
                  label={SEVERITY_STYLES[s].label}
                  count={counts[s]}
                  tone={s}
                />
              </li>
            ))}
          </ul>

          <div className="mt-6 border-t border-grid pt-4">
            <p className="text-label text-ink-soft">What we check</p>
            <ul className="mt-2 space-y-1 text-xs text-ink-soft">
              <li>Secret keys in JS</li>
              <li>Supabase / Firebase access</li>
              <li>Security headers &amp; HTTPS</li>
              <li>CORS &amp; admin routes</li>
              <li>.env &amp; source maps</li>
              <li>XSS / injection (if consented)</li>
              <li>Dependency CVEs (public repo)</li>
            </ul>
            {preview && (
              <p className="mt-3 text-xs text-ink-soft">
                Preview covers 4 checks. Full scans run the complete suite.
              </p>
            )}
          </div>
        </aside>

        {/* Findings */}
        <div className="min-w-0 flex-1 p-4 sm:p-5">
          <p className="text-label mb-3 text-ink-soft">Findings</p>
          {filtered.length === 0 ? (
            <p className="text-sm text-ink-soft">No findings in this filter.</p>
          ) : (
            <ul className="space-y-3">
              {filtered.map((f, i) => {
                const key = `${f.id}-${i}`;
                const open = openId === key;
                const tone = SEVERITY_STYLES[f.severity];
                return (
                  <li key={key} className="blueprint-border bg-paper/40">
                    <button
                      type="button"
                      className="flex w-full items-start gap-3 px-3 py-3 text-left sm:px-4"
                      aria-expanded={open}
                      onClick={() => setOpenId(open ? null : key)}
                    >
                      <span
                        className={`mt-0.5 shrink-0 border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${tone.className}`}
                      >
                        {tone.label}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium text-ink">{f.title}</span>
                        <span className="mt-0.5 block truncate font-mono text-xs text-ink-soft">
                          {f.location}
                        </span>
                      </span>
                      <span className="text-ink-soft" aria-hidden>
                        {open ? "−" : "+"}
                      </span>
                    </button>
                    {open && (
                      <div className="border-t border-grid px-3 py-3 sm:px-4">
                        <p className="text-sm text-ink-soft">{f.detail}</p>
                        {f.evidence && (
                          <pre className="mt-3 overflow-x-auto bg-ink px-3 py-2 font-mono text-xs text-paper">
                            {f.evidence}
                          </pre>
                        )}
                        {f.fix && (
                          <div className="mt-3">
                            <p className="text-label text-ink-soft">
                              {f.fix.type === "prompt"
                                ? "Paste into your AI tool"
                                : f.fix.type === "code"
                                  ? "Fix"
                                  : "What to do"}
                            </p>
                            {f.fix.type === "prompt" ? (
                              <blockquote className="mt-2 border-l-4 border-warning bg-warning/10 px-3 py-2 text-sm text-ink">
                                {f.fix.content}
                              </blockquote>
                            ) : (
                              <pre className="mt-2 overflow-x-auto whitespace-pre-wrap bg-ink px-3 py-2 font-mono text-xs text-paper">
                                {f.fix.content}
                              </pre>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function FilterButton({
  active,
  onClick,
  label,
  count,
  tone,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  tone?: Severity;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center justify-between px-2 py-1.5 text-left text-sm ${
        active ? "bg-ink text-paper" : "text-ink hover:bg-paper"
      }`}
    >
      <span className={!active && tone === "critical" ? "text-critical" : undefined}>
        {label}
      </span>
      <span className="font-mono text-xs opacity-80">{count}</span>
    </button>
  );
}
