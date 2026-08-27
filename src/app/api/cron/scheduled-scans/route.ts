import { NextResponse } from "next/server";
import { runDueScheduledScans } from "@/lib/scans/scheduler";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Secure with CRON_SECRET:
 *   Authorization: Bearer <CRON_SECRET>
 *   or ?secret=<CRON_SECRET>
 *
 * Vercel Cron example path:
 *   /api/cron/scheduled-scans?secret=$CRON_SECRET
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured." },
      { status: 503 }
    );
  }

  const auth = request.headers.get("authorization");
  const okBearer = auth === `Bearer ${secret}`;
  const okQuery = new URL(request.url).searchParams.get("secret") === secret;

  if (!okBearer && !okQuery) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runDueScheduledScans();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Scheduler failed";
    console.error("[cron/scheduled-scans]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
