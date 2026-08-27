"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type Mode = "login" | "signup";

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const isLogin = mode === "login";

  async function handleEmailAuth(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);

    const supabase = createClient();

    try {
      if (isLogin) {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (signInError) {
          setError(plainAuthError(signInError.message));
          return;
        }
        router.push("/dashboard");
        router.refresh();
      } else {
        const origin =
          process.env.NEXT_PUBLIC_APP_URL ?? window.location.origin;
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${origin}/auth/callback?next=/dashboard`,
          },
        });
        if (signUpError) {
          setError(plainAuthError(signUpError.message));
          return;
        }
        // If email confirmation is disabled in Supabase, a session is returned.
        if (data.session) {
          router.push("/dashboard");
          router.refresh();
          return;
        }
        setMessage(
          "Check your email for a confirmation link. After you confirm, you can sign in."
        );
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleGitHub() {
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const origin = process.env.NEXT_PUBLIC_APP_URL ?? window.location.origin;

    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "github",
      options: {
        redirectTo: `${origin}/auth/callback?next=/dashboard`,
        scopes: "read:user user:email",
      },
    });

    if (oauthError) {
      setError(plainAuthError(oauthError.message));
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-md">
      <button
        type="button"
        onClick={handleGitHub}
        disabled={loading}
        className="blueprint-border flex w-full items-center justify-center gap-2 bg-surface px-4 py-3 text-sm font-medium text-ink transition-opacity hover:bg-paper disabled:opacity-60"
      >
        <GitHubIcon />
        Continue with GitHub
      </button>

      <div className="my-6 flex items-center gap-3">
        <div className="h-px flex-1 bg-grid" />
        <span className="text-label text-ink-soft">or email</span>
        <div className="h-px flex-1 bg-grid" />
      </div>

      <form onSubmit={handleEmailAuth} className="space-y-4">
        <div>
          <label htmlFor="email" className="text-label text-ink-soft">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="blueprint-border mt-1.5 w-full bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-ink-soft/60"
            placeholder="you@example.com"
          />
        </div>
        <div>
          <label htmlFor="password" className="text-label text-ink-soft">
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete={isLogin ? "current-password" : "new-password"}
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="blueprint-border mt-1.5 w-full bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-ink-soft/60"
            placeholder={isLogin ? "Your password" : "At least 8 characters"}
          />
        </div>

        {error && (
          <p
            role="alert"
            className="border border-critical/40 bg-critical/5 px-3 py-2 text-sm text-critical"
          >
            {error}
          </p>
        )}
        {message && (
          <p
            role="status"
            className="border border-pass/40 bg-pass/5 px-3 py-2 text-sm text-pass"
          >
            {message}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="blueprint-border w-full bg-ink px-4 py-3 text-sm font-medium text-paper transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {loading
            ? "Working…"
            : isLogin
              ? "Sign in"
              : "Create account"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-ink-soft">
        {isLogin ? (
          <>
            New here?{" "}
            <Link href="/signup" className="font-medium text-ink underline-offset-2 hover:underline">
              Create an account
            </Link>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <Link href="/login" className="font-medium text-ink underline-offset-2 hover:underline">
              Sign in
            </Link>
          </>
        )}
      </p>
    </div>
  );
}

function plainAuthError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("invalid login")) {
    return "Email or password doesn’t match. Try again, or create an account.";
  }
  if (lower.includes("already registered") || lower.includes("already been registered")) {
    return "That email already has an account. Try signing in instead.";
  }
  if (lower.includes("password")) {
    return "Password must be at least 8 characters.";
  }
  if (lower.includes("rate") || lower.includes("email rate")) {
    return "Too many attempts. Wait a minute and try again.";
  }
  return message;
}

function GitHubIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.44 9.8 8.21 11.39.6.11.82-.26.82-.58 0-.28-.01-1.02-.02-2-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.33-1.76-1.33-1.76-1.09-.74.08-.73.08-.73 1.2.09 1.84 1.24 1.84 1.24 1.07 1.84 2.81 1.31 3.5 1 .11-.78.42-1.31.76-1.61-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.12-.3-.54-1.52.12-3.18 0 0 1.01-.32 3.3 1.23.96-.27 1.98-.4 3-.4s2.04.13 3 .4c2.29-1.55 3.3-1.23 3.3-1.23.66 1.66.24 2.88.12 3.18.77.84 1.24 1.91 1.24 3.22 0 4.61-2.81 5.62-5.48 5.92.43.37.81 1.1.81 2.22 0 1.61-.01 2.9-.01 3.3 0 .32.22.7.82.58A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
    </svg>
  );
}
