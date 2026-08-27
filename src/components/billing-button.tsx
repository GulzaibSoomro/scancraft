"use client";

import { useState } from "react";

type Props = {
  mode?: "checkout" | "portal";
  label?: string;
  className?: string;
};

export function BillingButton({
  mode = "checkout",
  label,
  className,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const defaultLabel =
    mode === "portal" ? "Manage billing" : "Upgrade to Pro";

  async function onClick() {
    setError(null);
    setLoading(true);
    try {
      const endpoint =
        mode === "portal" ? "/api/billing/portal" : "/api/billing/checkout";
      const res = await fetch(endpoint, { method: "POST" });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        setError(data.error ?? "Something went wrong.");
        return;
      }
      window.location.href = data.url;
    } catch {
      setError("Network error — try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => void onClick()}
        disabled={loading}
        className={
          className ??
          "blueprint-border bg-ink px-5 py-2.5 text-sm font-medium text-paper transition-opacity hover:opacity-90 disabled:opacity-50"
        }
      >
        {loading ? "Redirecting…" : label ?? defaultLabel}
      </button>
      {error && (
        <p role="alert" className="mt-2 text-sm text-critical">
          {error}
        </p>
      )}
    </div>
  );
}
