import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { dbFindingToFinding } from "@/lib/scans/execute";

export const runtime = "nodejs";

type Params = { params: { id: string } };

export async function GET(_request: Request, { params }: Params) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: scan, error } = await supabase
    .from("scans")
    .select(
      "id, status, started_at, completed_at, overall_verdict, error_message, is_preview, created_at, project_id"
    )
    .eq("id", params.id)
    .maybeSingle();

  if (error || !scan) {
    return NextResponse.json({ error: "Scan not found." }, { status: 404 });
  }

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id, name, deployed_url, github_repo_url, platform, user_id")
    .eq("id", scan.project_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (projectError || !project) {
    return NextResponse.json({ error: "Scan not found." }, { status: 404 });
  }

  let findings: ReturnType<typeof dbFindingToFinding>[] = [];
  if (scan.status === "complete") {
    const { data: rows } = await supabase
      .from("findings")
      .select(
        "check_id, severity, title, location, detail, evidence, fix_type, fix_content"
      )
      .eq("scan_id", scan.id)
      .order("created_at", { ascending: true });

    findings = (rows ?? []).map(dbFindingToFinding);
  }

  return NextResponse.json({
    id: scan.id,
    status: scan.status,
    verdict: scan.overall_verdict,
    errorMessage: scan.error_message,
    startedAt: scan.started_at,
    completedAt: scan.completed_at,
    createdAt: scan.created_at,
    project: {
      id: project.id,
      name: project.name,
      deployedUrl: project.deployed_url,
      githubRepoUrl: project.github_repo_url,
      platform: project.platform,
    },
    findings,
  });
}
