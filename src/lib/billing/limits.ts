import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

type Client = SupabaseClient<Database>;

/** Free tier: 1 full (non-preview) scan per calendar month. Pro: unlimited. */
export async function canStartFullScan(
  supabase: Client,
  userId: string
): Promise<{ allowed: boolean; reason?: string; tier: "free" | "pro" }> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("subscription_tier")
    .eq("id", userId)
    .maybeSingle();

  const tier = (profile?.subscription_tier ?? "free") as "free" | "pro";
  if (tier === "pro") {
    return { allowed: true, tier };
  }

  const startOfMonth = new Date();
  startOfMonth.setUTCDate(1);
  startOfMonth.setUTCHours(0, 0, 0, 0);

  const { data: projects } = await supabase
    .from("projects")
    .select("id")
    .eq("user_id", userId);

  const projectIds = (projects ?? []).map((p) => p.id);
  if (projectIds.length === 0) {
    return { allowed: true, tier };
  }

  const { count, error } = await supabase
    .from("scans")
    .select("id", { count: "exact", head: true })
    .in("project_id", projectIds)
    .eq("is_preview", false)
    .gte("created_at", startOfMonth.toISOString())
    .neq("status", "failed");

  if (error) {
    return {
      allowed: false,
      tier,
      reason: "Could not check your scan allowance. Try again in a moment.",
    };
  }

  if ((count ?? 0) >= 1) {
    return {
      allowed: false,
      tier,
      reason:
        "Free tier includes 1 full scan per month. Upgrade to Pro for unlimited scans, or try the free preview on the homepage.",
    };
  }

  return { allowed: true, tier };
}
