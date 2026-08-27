import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { executeScanJob } from "@/lib/scans/execute";

export const runtime = "nodejs";
export const maxDuration = 60;

type Params = { params: { id: string } };

export async function POST(request: Request, { params }: Params) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let consentActiveProbes = false;
  try {
    const body = (await request.json()) as { consentActiveProbes?: boolean };
    consentActiveProbes = !!body.consentActiveProbes;
  } catch {
    // empty body is fine
  }

  // Ownership enforced by RLS on select/update
  const { data: scan, error } = await supabase
    .from("scans")
    .select("id, status")
    .eq("id", params.id)
    .maybeSingle();

  if (error || !scan) {
    return NextResponse.json({ error: "Scan not found." }, { status: 404 });
  }

  if (scan.status === "complete") {
    return NextResponse.json({ status: "complete" });
  }
  if (scan.status === "running") {
    return NextResponse.json({ status: "running" });
  }

  try {
    const result = await executeScanJob(supabase, params.id, {
      consentActiveProbes,
    });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Scan failed";
    return NextResponse.json({ error: message, status: "failed" }, { status: 500 });
  }
}
