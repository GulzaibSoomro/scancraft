import Stripe from "stripe";

let stripeSingleton: Stripe | null = null;

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY is not configured.");
  }
  if (!stripeSingleton) {
    stripeSingleton = new Stripe(key, {
      apiVersion: "2026-08-26.dahlia",
      typescript: true,
    });
  }
  return stripeSingleton;
}

export function getProPriceId(): string {
  const id = process.env.STRIPE_PRICE_ID_PRO;
  if (!id) {
    throw new Error("STRIPE_PRICE_ID_PRO is not configured.");
  }
  return id;
}

export function getAppUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    "http://localhost:3000"
  );
}

/** Pro: $12/mo — middle of the $9–15 range from the product brief. */
export const PRO_PRICE_DISPLAY = {
  amount: "$12",
  interval: "month",
  label: "Pro",
} as const;

export function isStripeConfigured(): boolean {
  return Boolean(
    process.env.STRIPE_SECRET_KEY &&
      process.env.STRIPE_PRICE_ID_PRO &&
      process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  );
}

export function tierFromSubscriptionStatus(
  status: Stripe.Subscription.Status | string | null | undefined
): "free" | "pro" {
  if (status === "active" || status === "trialing") return "pro";
  return "free";
}
