import type { Finding } from "@/lib/types";

function findingKey(f: Pick<Finding, "id" | "title" | "location" | "severity">) {
  return `${f.id}|${f.severity}|${f.title}|${f.location}`;
}

/** New critical/warning findings that weren't in the previous scan. */
export function diffNewRiskFindings(
  previous: Finding[],
  current: Finding[]
): Finding[] {
  const prevKeys = new Set(
    previous
      .filter((f) => f.severity === "critical" || f.severity === "warning")
      .map(findingKey)
  );

  return current.filter(
    (f) =>
      (f.severity === "critical" || f.severity === "warning") &&
      !prevKeys.has(findingKey(f))
  );
}
