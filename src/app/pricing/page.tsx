import Link from "next/link";
import { Logo } from "@/components/logo";
import { BillingButton } from "@/components/billing-button";
import { createClient } from "@/lib/supabase/server";
import { isStripeConfigured, PRO_PRICE_DISPLAY } from "@/lib/stripe";

export default async function PricingPage({
  searchParams,
}: {
  searchParams: { checkout?: string };
}) {
  let signedIn = false;
  let tier: "free" | "pro" = "free";

  if (
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      signedIn = !!user;
      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("subscription_tier")
          .eq("id", user.id)
          .maybeSingle();
        tier = (profile?.subscription_tier as "free" | "pro") ?? "free";
      }
    } catch {
      signedIn = false;
    }
  }

  const stripeReady = isStripeConfigured();
  const canceled = searchParams.checkout === "cancel";

  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
        <Logo />
        <nav className="flex items-center gap-3 text-sm">
          {signedIn ? (
            <Link
              href="/dashboard"
              className="blueprint-border bg-ink px-4 py-2 font-medium text-paper"
            >
              Dashboard
            </Link>
          ) : (
            <>
              <Link href="/login" className="px-3 py-2 font-medium text-ink">
                Sign in
              </Link>
              <Link
                href="/signup"
                className="blueprint-border bg-ink px-4 py-2 font-medium text-paper"
              >
                Create account
              </Link>
            </>
          )}
        </nav>
      </header>

      <main className="mx-auto max-w-5xl px-6 pb-20 pt-10">
        <p className="text-label text-ink-soft">Simple pricing</p>
        <h1 className="mt-2 font-display text-4xl font-bold tracking-tight text-ink">
          Pick the plan that fits
        </h1>
        <p className="mt-3 max-w-2xl text-ink-soft">
          Preview scans stay free forever. Upgrade when you need unlimited full
          scans and room to grow.
        </p>

        {canceled && (
          <p
            role="status"
            className="mt-6 border border-ink-soft/30 bg-surface px-3 py-2 text-sm text-ink-soft"
          >
            Checkout canceled — no charge. You can upgrade anytime.
          </p>
        )}

        <div className="mt-10 grid gap-6 md:grid-cols-2">
          <section className="blueprint-border bg-surface p-6">
            <p className="text-label text-ink-soft">Free</p>
            <p className="mt-2 font-display text-3xl font-bold text-ink">$0</p>
            <ul className="mt-4 space-y-2 text-sm text-ink-soft">
              <li>Unlimited homepage preview scans (4 checks)</li>
              <li>1 full scan per month</li>
              <li>Markdown export</li>
              <li>Scan history for your projects</li>
            </ul>
            <Link
              href={signedIn ? "/dashboard" : "/signup"}
              className="blueprint-border mt-6 inline-block bg-surface px-5 py-2.5 text-sm font-medium text-ink"
            >
              {signedIn ? "Go to dashboard" : "Start free"}
            </Link>
          </section>

          <section className="blueprint-border bg-surface p-6 ring-2 ring-ink">
            <p className="text-label text-ink-soft">{PRO_PRICE_DISPLAY.label}</p>
            <p className="mt-2 font-display text-3xl font-bold text-ink">
              {PRO_PRICE_DISPLAY.amount}
              <span className="text-lg font-medium text-ink-soft">
                /{PRO_PRICE_DISPLAY.interval}
              </span>
            </p>
            <ul className="mt-4 space-y-2 text-sm text-ink-soft">
              <li>Unlimited full scans</li>
              <li>All check modules + active probes</li>
              <li>PDF export for client handoffs</li>
              <li>Weekly automated re-scans</li>
              <li>Email / Slack alerts on new findings</li>
              <li>Multi-project history</li>
            </ul>
            <div className="mt-6">
              {!stripeReady ? (
                <p className="text-sm text-ink-soft">
                  Stripe isn’t configured in this environment yet.
                </p>
              ) : !signedIn ? (
                <Link
                  href="/signup"
                  className="blueprint-border inline-block bg-ink px-5 py-2.5 text-sm font-medium text-paper"
                >
                  Create account to upgrade
                </Link>
              ) : tier === "pro" ? (
                <div className="space-y-3">
                  <p className="text-sm text-pass">You’re on Pro.</p>
                  <BillingButton mode="portal" />
                </div>
              ) : (
                <BillingButton mode="checkout" />
              )}
            </div>
          </section>
        </div>

        <p className="mt-8 text-sm text-ink-soft">
          No credit card for free preview or free tier. Cancel Pro anytime from
          the billing portal.
        </p>
      </main>
    </div>
  );
}
