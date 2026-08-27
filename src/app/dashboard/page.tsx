import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { NewScanForm } from "@/components/new-scan-form";
import { canStartFullScan } from "@/lib/billing/limits";

export default async function DashboardPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let tier: "free" | "pro" = "free";
  let allowanceNote: string | null = null;

  if (user) {
    const allowance = await canStartFullScan(supabase, user.id);
    tier = allowance.tier;
    if (!allowance.allowed) {
      allowanceNote = allowance.reason ?? null;
    }
  }

  const { data: projects } = user
    ? await supabase
        .from("projects")
        .select("id, name, deployed_url, platform, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(20)
    : { data: [] };

  const projectIds = (projects ?? []).map((p) => p.id);
  const { data: recentScans } =
    projectIds.length > 0
      ? await supabase
          .from("scans")
          .select("id, status, overall_verdict, created_at, project_id, completed_at")
          .in("project_id", projectIds)
          .order("created_at", { ascending: false })
          .limit(10)
      : { data: [] };

  const projectById = new Map((projects ?? []).map((p) => [p.id, p]));

  return (
    <main>
      <div className="blueprint-border bg-surface p-6 sm:p-8">
        <p className="text-label text-ink-soft">Workspace</p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-ink">
          Dashboard
        </h1>
        <p className="mt-3 max-w-2xl text-ink-soft">
          Paste your live app URL, tell us which AI tool you built with, and run a
          full inspection. Results land in your scan history.
        </p>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="blueprint-border bg-surface p-5 sm:p-6">
          <h2 className="text-label text-ink">New scan</h2>
          {allowanceNote && (
            <div
              role="status"
              className="mt-3 border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-ink"
            >
              <p>{allowanceNote}</p>
              <p className="mt-2">
                <Link
                  href="/pricing"
                  className="font-medium text-ink underline-offset-2 hover:underline"
                >
                  Upgrade to Pro
                </Link>{" "}
                for unlimited full scans.
              </p>
            </div>
          )}
          {tier === "free" && !allowanceNote && (
            <p className="mt-3 text-xs text-ink-soft">
              On Free ·{" "}
              <Link href="/pricing" className="underline-offset-2 hover:underline">
                See Pro ($12/mo)
              </Link>
            </p>
          )}
          {tier === "pro" && (
            <p className="mt-3 text-xs text-pass">Pro · unlimited full scans</p>
          )}
          <div className="mt-4">
            <NewScanForm tier={tier} />
          </div>
        </section>

        <div className="space-y-6">
          <section className="blueprint-border bg-surface p-5">
            <h2 className="text-label text-ink">Recent scans</h2>
            {(recentScans ?? []).length === 0 ? (
              <p className="mt-3 font-mono text-xs text-ink-soft">No scans yet</p>
            ) : (
              <ul className="mt-3 divide-y divide-grid">
                {(recentScans ?? []).map((scan) => {
                  const project = projectById.get(scan.project_id);
                  return (
                    <li key={scan.id} className="py-3">
                      <Link
                        href={`/dashboard/scans/${scan.id}`}
                        className="block hover:bg-paper/80"
                      >
                        <span className="font-medium text-ink">
                          {project?.name ?? "Project"}
                        </span>
                        <span className="mt-0.5 block font-mono text-xs text-ink-soft">
                          {scan.status}
                          {scan.overall_verdict ? ` · ${scan.overall_verdict}` : ""}
                          {" · "}
                          {new Date(scan.created_at).toLocaleString()}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="blueprint-border bg-surface p-5">
            <h2 className="text-label text-ink">Projects</h2>
            {(projects ?? []).length === 0 ? (
              <p className="mt-3 font-mono text-xs text-ink-soft">No projects yet</p>
            ) : (
              <ul className="mt-3 space-y-3">
                {(projects ?? []).map((p) => (
                  <li key={p.id}>
                    <Link
                      href={`/dashboard/projects/${p.id}`}
                      className="block hover:bg-paper/60"
                    >
                      <p className="font-medium text-ink">{p.name}</p>
                      <p className="truncate font-mono text-xs text-ink-soft">
                        {p.deployed_url}
                      </p>
                      {p.platform && (
                        <p className="text-label mt-1 text-ink-soft">{p.platform}</p>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      <p className="mt-8 text-sm text-ink-soft">
        Need a quick look without using your monthly scan?{" "}
        <Link href="/" className="font-medium text-ink underline-offset-2 hover:underline">
          Free preview on the homepage
        </Link>
      </p>
    </main>
  );
}
