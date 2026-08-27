import { ScanStatusClient } from "@/components/scan-status-client";
import { createClient } from "@/lib/supabase/server";

export default async function ScanPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { consent?: string };
}) {
  let canExportPdf = false;
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("subscription_tier")
        .eq("id", user.id)
        .maybeSingle();
      canExportPdf = profile?.subscription_tier === "pro";
    }
  } catch {
    canExportPdf = false;
  }

  return (
    <main>
      <ScanStatusClient
        scanId={params.id}
        consentActiveProbes={searchParams.consent === "1"}
        canExportPdf={canExportPdf}
      />
    </main>
  );
}
