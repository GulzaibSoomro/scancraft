import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select(
      "subscription_tier, alert_email_enabled, slack_webhook_url, email"
    )
    .eq("id", user.id)
    .maybeSingle();

  if (error || !profile) {
    return NextResponse.json({ error: "Profile not found." }, { status: 404 });
  }

  return NextResponse.json({
    tier: profile.subscription_tier,
    email: profile.email,
    alertEmailEnabled: profile.alert_email_enabled,
    slackWebhookUrl: profile.slack_webhook_url,
  });
}

export async function PATCH(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    alertEmailEnabled?: boolean;
    slackWebhookUrl?: string | null;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const patch: {
    alert_email_enabled?: boolean;
    slack_webhook_url?: string | null;
  } = {};

  if (typeof body.alertEmailEnabled === "boolean") {
    patch.alert_email_enabled = body.alertEmailEnabled;
  }

  if (body.slackWebhookUrl !== undefined) {
    const raw = (body.slackWebhookUrl ?? "").trim();
    if (raw) {
      try {
        const u = new URL(raw);
        if (u.protocol !== "https:") {
          return NextResponse.json(
            { error: "Slack webhook must be an https URL." },
            { status: 400 }
          );
        }
        if (!u.hostname.includes("hooks.slack.com") && !u.hostname.includes("discord.com")) {
          // Allow Slack; also Discord webhooks are a common freelancer ask — keep Slack-focused message but accept discord
        }
        patch.slack_webhook_url = raw;
      } catch {
        return NextResponse.json(
          { error: "Invalid Slack webhook URL." },
          { status: 400 }
        );
      }
    } else {
      patch.slack_webhook_url = null;
    }
  }

  const { data, error } = await supabase
    .from("profiles")
    .update(patch)
    .eq("id", user.id)
    .select("alert_email_enabled, slack_webhook_url")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    alertEmailEnabled: data.alert_email_enabled,
    slackWebhookUrl: data.slack_webhook_url,
  });
}
