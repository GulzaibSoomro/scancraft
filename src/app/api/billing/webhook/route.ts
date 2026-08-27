import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe, tierFromSubscriptionStatus } from "@/lib/stripe";
import {
  setProfileTierByCustomerId,
  setProfileTierByUserId,
} from "@/lib/billing/stripe-customers";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret || !process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json(
      { error: "Webhook not configured." },
      { status: 503 }
    );
  }

  const stripe = getStripe();
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature." }, { status: 400 });
  }

  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid signature";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode !== "subscription") break;

        const customerId =
          typeof session.customer === "string"
            ? session.customer
            : session.customer?.id;
        const userId = session.metadata?.supabase_user_id;

        if (customerId && userId) {
          await setProfileTierByUserId(userId, "pro", customerId);
        } else if (customerId) {
          await setProfileTierByCustomerId(customerId, "pro");
        }
        break;
      }
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId =
          typeof sub.customer === "string" ? sub.customer : sub.customer.id;
        const tier = tierFromSubscriptionStatus(
          event.type === "customer.subscription.deleted" ? "canceled" : sub.status
        );
        await setProfileTierByCustomerId(customerId, tier);

        const userId = sub.metadata?.supabase_user_id;
        if (userId) {
          await setProfileTierByUserId(userId, tier, customerId);
        }
        break;
      }
      default:
        break;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Webhook handler failed";
    console.error("[stripe webhook]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
