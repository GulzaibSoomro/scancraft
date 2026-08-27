import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { NewScanForm } from "@/components/new-scan-form";
import { WeeklyRescanToggle } from "@/components/weekly-rescan-toggle";
import { canStartFullScan } from "@/lib/billing/limits";

export default async function ProjectHistoryPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: project } = await supabase
    .from("projects")
    .select(
      "id, name, deployed_url, github_repo_url, platform, created_at, weekly_rescan_enabled, last_auto_scan_at, next_auto_scan_at"
    )
    .eq("id", params.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!project) notFound();

  const { data: scans } = await supabase
    .from("scans")
    .select(
      "id, status, overall_verdict, created_at, completed_at, started_at, error_message, trigger"
    )
    .eq("project_id", project.id)
    .order("created_at", { ascending: false });

  const allowance = await canStartFullScan(supabase, user.id);
  const isPro = allowance.tier === "pro";

  const completed = (scans ?? []).filter((s) => s.status === "complete");
  const improved =
    completed.length >= 2 &&
    completed[0].overall_verdict === "secure" &&
    completed.some((s) => s.overall_verdict === "at_risk");

  return (
    <main className="space-y-6">
      <div>
        <Link
          href="/dashboard"
          className="text-sm text-ink-soft underline-offset-2 hover:underline"
        >
          ← Dashboard
        </Link>
      </div>

      <div className="blueprint-border bg-surface p-6 sm:p-8">
        <p className="text-label text-ink-soft">Project history</p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-ink">
          {project.name}
        </h1>
        <p className="mt-2 break-all font-mono text-sm text-ink-soft">
          {project.deployed_url}
        </p>
        <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-xs text-ink-soft">
          {project.platform && (
            <div>
              <dt className="text-label">Platform</dt>
              <dd className="mt-0.5 font-mono">{project.platform}</dd>
            </div>
          )}
          {project.github_repo_url && (
            <div>
              <dt className="text-label">Repo</dt>
              <dd className="mt-0.5 break-all font-mono">{project.github_repo_url}</dd>
            </div>
          )}
          <div>
            <dt className="text-label">Created</dt>
            <dd className="mt-0.5 font-mono">
              {new Date(project.created_at).toLocaleDateString()}
            </dd>
          </div>
        </dl>
        {improved && (
          <p className="mt-4 border border-pass/40 bg-pass/10 px-3 py-2 text-sm text-pass">
            Nice — the latest completed scan is SECURE after an earlier AT RISK
            result. Things look improved over time.
          </p>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="blueprint-border bg-surface p-5">
          <h2 className="text-label text-ink">Scan timeline</h2>
          {(scans ?? []).length === 0 ? (
            <p className="mt-3 font-mono text-xs text-ink-soft">No scans yet</p>
          ) : (
            <ol className="mt-4 space-y-0 border-l border-ink pl-4">
              {(scans ?? []).map((scan) => (
                <li key={scan.id} className="relative pb-6 last:pb-0">
                  <span
                    className="absolute -left-[1.4rem] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-ink bg-surface"
                    aria-hidden
                  />
                  <Link
                    href={`/dashboard/scans/${scan.id}`}
                    className="block hover:bg-paper/60"
                  >
                    <span className="font-medium text-ink">
                      {verdictLabel(scan.status, scan.overall_verdict)}
                    </span>
                    <span className="mt-0.5 block font-mono text-xs text-ink-soft">
                      {scan.status}
                      {scan.trigger === "scheduled" ? " · scheduled" : ""}
                      {" · "}
                      {new Date(scan.created_at).toLocaleString()}
                    </span>
                    {scan.error_message && (
                      <span className="mt-1 block text-xs text-critical">
                        {scan.error_message}
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </section>

        <div className="space-y-6">
          <WeeklyRescanToggle
            projectId={project.id}
            initialEnabled={project.weekly_rescan_enabled}
            nextAutoScanAt={project.next_auto_scan_at}
            lastAutoScanAt={project.last_auto_scan_at}
            isPro={isPro}
          />

          <section className="blueprint-border bg-surface p-5">
            <h2 className="text-label text-ink">Re-scan now</h2>
            {!allowance.allowed && (
              <p className="mt-3 border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-ink">
                {allowance.reason}
              </p>
            )}
            <div className="mt-4">
              <NewScanForm tier={allowance.tier} projectId={project.id} />
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

function verdictLabel(status: string, verdict: string | null): string {
  if (status !== "complete") {
    return status.charAt(0).toUpperCase() + status.slice(1);
  }
  if (verdict === "at_risk") return "AT RISK";
  if (verdict === "secure") return "SECURE";
  return "Complete";
}
