import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAppUrl, getStripe, isStripeConfigured } from "@/lib/stripe";

export const runtime = "nodejs";

export async function POST() {
  if (!isStripeConfigured()) {
    return NextResponse.json(
      { error: "Billing isn’t set up yet." },
      { status: 503 }
    );
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.stripe_customer_id) {
    return NextResponse.json(
      { error: "No billing account yet. Subscribe from the pricing page first." },
      { status: 400 }
    );
  }

  try {
    const stripe = getStripe();
    const session = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: `${getAppUrl()}/dashboard/billing`,
    });
    return NextResponse.json({ url: session.url });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Portal failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
