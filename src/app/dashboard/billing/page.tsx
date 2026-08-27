import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { BillingButton } from "@/components/billing-button";
import { AlertSettingsForm } from "@/components/alert-settings-form";
import { isStripeConfigured, PRO_PRICE_DISPLAY } from "@/lib/stripe";
import { redirect } from "next/navigation";

export default async function BillingPage({
  searchParams,
}: {
  searchParams: { checkout?: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?next=/dashboard/billing");

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "subscription_tier, stripe_customer_id, email, alert_email_enabled, slack_webhook_url"
    )
    .eq("id", user.id)
    .maybeSingle();

  const tier = (profile?.subscription_tier as "free" | "pro") ?? "free";
  const stripeReady = isStripeConfigured();
  const success = searchParams.checkout === "success";

  return (
    <main className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link
          href="/dashboard"
          className="text-sm text-ink-soft underline-offset-2 hover:underline"
        >
          ← Dashboard
        </Link>
      </div>

      <div className="blueprint-border bg-surface p-6 sm:p-8">
        <p className="text-label text-ink-soft">Billing</p>
        <h1 className="mt-2 font-display text-3xl font-bold text-ink">
          Your plan
        </h1>

        {success && (
          <p
            role="status"
            className="mt-4 border border-pass/40 bg-pass/10 px-3 py-2 text-sm text-pass"
          >
            Thanks — checkout completed. If Pro doesn’t show yet, wait a few
            seconds for Stripe’s webhook, then refresh.
          </p>
        )}

        <dl className="mt-6 grid gap-3 text-sm">
          <div className="flex justify-between border-b border-grid py-2">
            <dt className="text-ink-soft">Email</dt>
            <dd className="font-mono text-ink">{profile?.email ?? user.email}</dd>
          </div>
          <div className="flex justify-between border-b border-grid py-2">
            <dt className="text-ink-soft">Current plan</dt>
            <dd className="font-display font-bold uppercase tracking-wider text-ink">
              {tier}
            </dd>
          </div>
          <div className="flex justify-between border-b border-grid py-2">
            <dt className="text-ink-soft">Pro price</dt>
            <dd className="text-ink">
              {PRO_PRICE_DISPLAY.amount}/{PRO_PRICE_DISPLAY.interval}
            </dd>
          </div>
        </dl>

        <div className="mt-8 space-y-3">
          {!stripeReady ? (
            <p className="text-sm text-ink-soft">
              Stripe keys aren’t set. Add them to{" "}
              <code className="font-mono">.env.local</code> to enable upgrades.
            </p>
          ) : tier === "pro" ? (
            <BillingButton mode="portal" />
          ) : (
            <>
              <BillingButton mode="checkout" label="Upgrade to Pro — $12/mo" />
              <p className="text-xs text-ink-soft">
                Unlimited scans, PDF export, weekly re-scans. Cancel anytime.
              </p>
            </>
          )}
        </div>
      </div>

      <AlertSettingsForm
        isPro={tier === "pro"}
        initialEmailEnabled={profile?.alert_email_enabled ?? true}
        initialSlackUrl={profile?.slack_webhook_url ?? null}
        email={profile?.email ?? user.email ?? null}
      />

      <p className="text-sm text-ink-soft">
        Compare plans on the{" "}
        <Link
          href="/pricing"
          className="font-medium text-ink underline-offset-2 hover:underline"
        >
          pricing page
        </Link>
        . Enable weekly re-scans on each project’s history page.
      </p>
    </main>
  );
}
