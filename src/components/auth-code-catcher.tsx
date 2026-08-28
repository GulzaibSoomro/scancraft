"use client";

import { useEffect } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * If Supabase falls back to Site URL (homepage) with ?code=..., finish login here.
 */
export function AuthCodeCatcher() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (pathname?.startsWith("/auth/callback")) return;

    const code = searchParams.get("code");
    if (!code) return;

    const next = searchParams.get("next") ?? "/dashboard";
    const params = new URLSearchParams({ code, next });
    router.replace(`/auth/callback?${params.toString()}`);
  }, [pathname, searchParams, router]);

  // Also recover hash tokens if any (legacy implicit flow)
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.location.hash.includes("access_token")) return;

    const supabase = createClient();
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        router.replace("/dashboard");
        router.refresh();
      }
    });
  }, [router]);

  return null;
}
