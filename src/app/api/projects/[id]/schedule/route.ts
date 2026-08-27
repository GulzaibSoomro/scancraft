import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { nextWeekIso } from "@/lib/scans/scheduler";

export const runtime = "nodejs";

type Params = { params: { id: string } };

export async function PATCH(request: Request, { params }: Params) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("subscription_tier")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.subscription_tier !== "pro") {
    return NextResponse.json(
      {
        error: "Weekly re-scans are a Pro feature. Upgrade to enable them.",
        code: "pro_required",
      },
      { status: 402 }
    );
  }

  let body: { enabled?: boolean };
  try {
    body = (await request.json()) as { enabled?: boolean };
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const enabled = !!body.enabled;

  const { data: project, error } = await supabase
    .from("projects")
    .update({
      weekly_rescan_enabled: enabled,
      next_auto_scan_at: enabled ? nextWeekIso() : null,
    })
    .eq("id", params.id)
    .eq("user_id", user.id)
    .select(
      "id, weekly_rescan_enabled, next_auto_scan_at, last_auto_scan_at"
    )
    .maybeSingle();

  if (error || !project) {
    return NextResponse.json(
      { error: error?.message ?? "Project not found." },
      { status: 404 }
    );
  }

  return NextResponse.json({ project });
}
