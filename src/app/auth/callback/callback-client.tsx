"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Logo } from "@/components/logo";

/**
 * Client-side OAuth/email code exchange.
 * More reliable than a Route Handler for PKCE: the browser client that
 * started GitHub login also finishes it and writes the session cookies.
 */
export default function AuthCallbackClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState("Finishing sign-in…");

  useEffect(() => {
    let cancelled = false;

    async function finish() {
      const code = searchParams.get("code");
      const nextRaw = searchParams.get("next") ?? "/dashboard";
      const next =
        nextRaw.startsWith("/") && !nextRaw.startsWith("//")
          ? nextRaw
          : "/dashboard";
      const oauthError = searchParams.get("error");
      const oauthDesc = searchParams.get("error_description");

      if (oauthError) {
        setStatus(oauthDesc || oauthError);
        router.replace(`/login?error=auth`);
        return;
      }

      if (!code) {
        setStatus("Missing auth code.");
        router.replace("/login?error=auth");
        return;
      }

      const supabase = createClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);

      if (cancelled) return;

      if (error) {
        console.error("[auth/callback]", error.message);
        setStatus(error.message);
        router.replace("/login?error=auth");
        return;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setStatus("Signed in, but no user session was found.");
        router.replace("/login?error=auth");
        return;
      }

      setStatus("Success — opening dashboard…");
      router.replace(next);
      router.refresh();
    }

    void finish();
    return () => {
      cancelled = true;
    };
  }, [router, searchParams]);

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 py-16">
      <Logo />
      <p className="mt-8 text-ink-soft" role="status">
        {status}
      </p>
    </main>
  );
}
