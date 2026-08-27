import { jsPDF } from "jspdf";
import type { Finding, OverallVerdict } from "@/lib/types";

export type PdfReportInput = {
  projectName: string;
  targetUrl: string;
  platform?: string | null;
  verdict: OverallVerdict;
  findings: Finding[];
  completedAt?: string;
  preview?: boolean;
};

const INK = { r: 29, g: 53, b: 87 };
const SOFT = { r: 74, g: 91, b: 122 };
const CRITICAL = { r: 193, g: 39, b: 45 };
const WARNING = { r: 181, g: 121, b: 15 };
const PASS = { r: 27, g: 122, b: 110 };

function severityColor(severity: Finding["severity"]) {
  switch (severity) {
    case "critical":
      return CRITICAL;
    case "warning":
      return WARNING;
    case "pass":
      return PASS;
    default:
      return SOFT;
  }
}

function count(findings: Finding[], severity: Finding["severity"]) {
  return findings.filter((f) => f.severity === severity).length;
}

/**
 * Client-side PDF for client handoffs. Matches the inspection-audit tone
 * without pulling in a headless browser.
 */
export function downloadFindingsPdf(report: PdfReportInput) {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 48;
  const maxWidth = pageWidth - margin * 2;
  let y = margin;

  const when = report.completedAt
    ? new Date(report.completedAt).toLocaleString()
    : new Date().toLocaleString();
  const verdictLabel = report.verdict === "at_risk" ? "AT RISK" : "SECURE";
  const verdictColor = report.verdict === "at_risk" ? CRITICAL : PASS;

  const ensureSpace = (needed: number) => {
    if (y + needed > pageHeight - margin) {
      doc.addPage();
      y = margin;
      drawFooter(doc, pageWidth, pageHeight, margin);
    }
  };

  // Header
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(INK.r, INK.g, INK.b);
  doc.text("SCANCRAFT", margin, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(SOFT.r, SOFT.g, SOFT.b);
  doc.text("INSPECTION REPORT · SEC-AUDIT", margin + 78, y);

  y += 22;
  doc.setDrawColor(INK.r, INK.g, INK.b);
  doc.setLineWidth(1);
  doc.line(margin, y, pageWidth - margin, y);
  y += 28;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(INK.r, INK.g, INK.b);
  const titleLines = doc.splitTextToSize(report.projectName, maxWidth - 120);
  doc.text(titleLines, margin, y);

  // Verdict stamp box
  const stampX = pageWidth - margin - 100;
  const stampY = y - 14;
  doc.setDrawColor(verdictColor.r, verdictColor.g, verdictColor.b);
  doc.setLineWidth(1.5);
  doc.rect(stampX, stampY, 100, 40);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(verdictColor.r, verdictColor.g, verdictColor.b);
  doc.text(verdictLabel, stampX + 50, stampY + 18, { align: "center" });
  doc.setFontSize(7);
  doc.text("SCANCRAFT · CERTIFIED", stampX + 50, stampY + 30, {
    align: "center",
  });

  y += titleLines.length * 24 + 8;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(SOFT.r, SOFT.g, SOFT.b);
  const meta = [
    `URL: ${report.targetUrl}`,
    `Platform: ${report.platform ?? "n/a"}`,
    `Scanned: ${when}`,
    `Mode: ${report.preview ? "Preview (limited checks)" : "Full scan"}`,
  ];
  for (const line of meta) {
    ensureSpace(14);
    const wrapped = doc.splitTextToSize(line, maxWidth);
    doc.text(wrapped, margin, y);
    y += wrapped.length * 12 + 2;
  }

  y += 10;
  ensureSpace(40);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(INK.r, INK.g, INK.b);
  doc.text("Summary", margin, y);
  y += 16;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(SOFT.r, SOFT.g, SOFT.b);
  doc.text(
    `Critical ${count(report.findings, "critical")}  ·  Warning ${count(report.findings, "warning")}  ·  Info ${count(report.findings, "info")}  ·  Pass ${count(report.findings, "pass")}`,
    margin,
    y
  );
  y += 24;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(INK.r, INK.g, INK.b);
  doc.text("Findings", margin, y);
  y += 18;

  const order = ["critical", "warning", "info", "pass"] as const;
  const sorted = [...report.findings].sort(
    (a, b) => order.indexOf(a.severity) - order.indexOf(b.severity)
  );

  if (sorted.length === 0) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(9);
    doc.setTextColor(SOFT.r, SOFT.g, SOFT.b);
    doc.text("No findings recorded.", margin, y);
  }

  for (const f of sorted) {
    const color = severityColor(f.severity);
    const detailLines = doc.splitTextToSize(f.detail, maxWidth);
    const locLines = doc.splitTextToSize(`Location: ${f.location}`, maxWidth);
    const fixLines = f.fix
      ? doc.splitTextToSize(
          `Fix (${f.fix.type}): ${f.fix.content}`,
          maxWidth
        )
      : [];
    const evidenceLines = f.evidence
      ? doc.splitTextToSize(`Evidence: ${f.evidence}`, maxWidth)
      : [];

    const blockHeight =
      16 +
      locLines.length * 11 +
      detailLines.length * 11 +
      evidenceLines.length * 11 +
      fixLines.length * 11 +
      16;

    ensureSpace(Math.min(blockHeight, 120));

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(color.r, color.g, color.b);
    doc.text(f.severity.toUpperCase(), margin, y);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(INK.r, INK.g, INK.b);
    const titleWrapped = doc.splitTextToSize(f.title, maxWidth - 70);
    doc.text(titleWrapped, margin + 70, y);
    y += Math.max(14, titleWrapped.length * 12);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(SOFT.r, SOFT.g, SOFT.b);
    doc.text(locLines, margin, y);
    y += locLines.length * 11 + 4;

    doc.setFontSize(9);
    doc.text(detailLines, margin, y);
    y += detailLines.length * 11 + 4;

    if (evidenceLines.length) {
      ensureSpace(evidenceLines.length * 11 + 8);
      doc.setFont("courier", "normal");
      doc.setFontSize(7);
      doc.text(evidenceLines, margin, y);
      y += evidenceLines.length * 10 + 4;
      doc.setFont("helvetica", "normal");
    }

    if (fixLines.length) {
      ensureSpace(fixLines.length * 11 + 8);
      doc.setFontSize(8);
      doc.setTextColor(INK.r, INK.g, INK.b);
      doc.text(fixLines, margin, y);
      y += fixLines.length * 10 + 4;
    }

    y += 10;
    doc.setDrawColor(196, 208, 224);
    doc.setLineWidth(0.5);
    doc.line(margin, y, pageWidth - margin, y);
    y += 14;
  }

  drawFooter(doc, pageWidth, pageHeight, margin);

  const safe = report.projectName.replace(/[^\w.-]+/g, "_").slice(0, 60);
  doc.save(`scancraft-${safe}.pdf`);
}

function drawFooter(
  doc: jsPDF,
  pageWidth: number,
  pageHeight: number,
  margin: number
) {
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(SOFT.r, SOFT.g, SOFT.b);
    doc.text(
      "Generated by ScanCraft. Secrets in evidence are redacted.",
      margin,
      pageHeight - 24
    );
    doc.text(`Page ${i} of ${pages}`, pageWidth - margin, pageHeight - 24, {
      align: "right",
    });
  }
}
