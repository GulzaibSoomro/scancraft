/**
 * Redact secrets before storing or logging.
 * Keeps a short prefix/suffix so findings stay useful without leaking keys.
 */
export function redactSecret(value: string, visible = 4): string {
  if (!value) return "";
  if (value.length <= visible * 2) {
    return "*".repeat(Math.min(value.length, 8));
  }
  return `${value.slice(0, visible)}…${value.slice(-visible)}`;
}

export function verdictFromFindings(
  findings: { severity: string }[]
): "at_risk" | "secure" {
  return findings.some((f) => f.severity === "critical") ? "at_risk" : "secure";
}
