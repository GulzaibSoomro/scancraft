"use client";

import { useState } from "react";
import Link from "next/link";

type Props = {
  isPro: boolean;
  initialEmailEnabled: boolean;
  initialSlackUrl: string | null;
  email: string | null;
};

export function AlertSettingsForm({
  isPro,
  initialEmailEnabled,
  initialSlackUrl,
  email,
}: Props) {
  const [alertEmailEnabled, setAlertEmailEnabled] = useState(initialEmailEnabled);
  const [slackWebhookUrl, setSlackWebhookUrl] = useState(initialSlackUrl ?? "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/alerts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          alertEmailEnabled,
          slackWebhookUrl: slackWebhookUrl.trim() || null,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not save.");
        return;
      }
      setMessage("Alert settings saved.");
    } catch {
      setError("Network error.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="blueprint-border bg-surface p-5">
      <h2 className="text-label text-ink">Alert settings</h2>
      <p className="mt-2 text-sm text-ink-soft">
        Used when a weekly re-scan finds new critical or warning issues.
      </p>

      {!isPro ? (
        <p className="mt-4 text-sm text-ink-soft">
          Alerts ship with Pro.{" "}
          <Link href="/pricing" className="font-medium text-ink underline-offset-2 hover:underline">
            See pricing
          </Link>
        </p>
      ) : (
        <form onSubmit={onSave} className="mt-4 space-y-4">
          <label className="flex items-start gap-2 text-sm text-ink">
            <input
              type="checkbox"
              className="mt-1"
              checked={alertEmailEnabled}
              onChange={(e) => setAlertEmailEnabled(e.target.checked)}
            />
            <span>
              Email alerts
              {email ? (
                <span className="mt-0.5 block font-mono text-xs text-ink-soft">
                  {email}
                </span>
              ) : (
                <span className="mt-0.5 block text-xs text-ink-soft">
                  (no email on profile)
                </span>
              )}
              <span className="mt-0.5 block text-xs text-ink-soft">
                Requires RESEND_API_KEY on the server.
              </span>
            </span>
          </label>

          <div>
            <label htmlFor="slack-url" className="text-label text-ink-soft">
              Slack incoming webhook URL
            </label>
            <input
              id="slack-url"
              type="url"
              value={slackWebhookUrl}
              onChange={(e) => setSlackWebhookUrl(e.target.value)}
              placeholder="https://hooks.slack.com/services/…"
              className="blueprint-border mt-1.5 w-full bg-paper px-3 py-2.5 text-sm text-ink"
            />
          </div>

          {error && (
            <p role="alert" className="text-sm text-critical">
              {error}
            </p>
          )}
          {message && (
            <p role="status" className="text-sm text-pass">
              {message}
            </p>
          )}

          <button
            type="submit"
            disabled={saving}
            className="blueprint-border bg-ink px-4 py-2 text-sm font-medium text-paper disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save alerts"}
          </button>
        </form>
      )}
    </section>
  );
}
