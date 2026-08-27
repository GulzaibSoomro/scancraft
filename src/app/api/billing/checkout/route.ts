import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getAppUrl,
  getProPriceId,
  getStripe,
  isStripeConfigured,
} from "@/lib/stripe";
import { getOrCreateStripeCustomer } from "@/lib/billing/stripe-customers";

export const runtime = "nodejs";

export async function POST() {
  if (!isStripeConfigured()) {
    return NextResponse.json(
      {
        error:
          "Billing isn’t set up yet. Add Stripe keys to .env.local (see .env.example).",
      },
      { status: 503 }
    );
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Sign in to upgrade." }, { status: 401 });
  }

  try {
    const customerId = await getOrCreateStripeCustomer(supabase, user);
    const stripe = getStripe();
    const appUrl = getAppUrl();

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: getProPriceId(), quantity: 1 }],
      success_url: `${appUrl}/dashboard/billing?checkout=success`,
      cancel_url: `${appUrl}/pricing?checkout=cancel`,
      allow_promotion_codes: true,
      metadata: { supabase_user_id: user.id },
      subscription_data: {
        metadata: { supabase_user_id: user.id },
      },
    });

    if (!session.url) {
      return NextResponse.json(
        { error: "Could not create checkout session." },
        { status: 500 }
      );
    }

    return NextResponse.json({ url: session.url });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Checkout failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
