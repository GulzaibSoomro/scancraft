import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { createServiceClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";

type Client = SupabaseClient<Database>;

export async function getOrCreateStripeCustomer(
  supabase: Client,
  user: { id: string; email?: string | null }
): Promise<string> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("stripe_customer_id, email")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.stripe_customer_id) {
    return profile.stripe_customer_id;
  }

  const stripe = getStripe();
  const customer = await stripe.customers.create({
    email: user.email ?? profile?.email ?? undefined,
    metadata: { supabase_user_id: user.id },
  });

  // Prefer service role so the update always succeeds even if RLS is tight.
  try {
    const admin = createServiceClient();
    await admin
      .from("profiles")
      .update({ stripe_customer_id: customer.id })
      .eq("id", user.id);
  } catch {
    await supabase
      .from("profiles")
      .update({ stripe_customer_id: customer.id })
      .eq("id", user.id);
  }

  return customer.id;
}

export async function setProfileTierByCustomerId(
  customerId: string,
  tier: "free" | "pro"
) {
  const admin = createServiceClient();
  const { error } = await admin
    .from("profiles")
    .update({ subscription_tier: tier })
    .eq("stripe_customer_id", customerId);

  if (error) {
    throw new Error(`Failed to update tier: ${error.message}`);
  }
}

export async function setProfileTierByUserId(
  userId: string,
  tier: "free" | "pro",
  stripeCustomerId?: string
) {
  const admin = createServiceClient();
  const patch: {
    subscription_tier: "free" | "pro";
    stripe_customer_id?: string;
  } = { subscription_tier: tier };
  if (stripeCustomerId) patch.stripe_customer_id = stripeCustomerId;

  const { error } = await admin.from("profiles").update(patch).eq("id", userId);
  if (error) {
    throw new Error(`Failed to update tier: ${error.message}`);
  }
}
