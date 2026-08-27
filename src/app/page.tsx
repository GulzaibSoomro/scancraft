import Link from "next/link";
import { Logo } from "@/components/logo";
import { PreviewScanForm } from "@/components/preview-scan-form";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  let signedIn = false;

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
    } catch {
      signedIn = false;
    }
  }

  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
        <Logo />
        <nav className="flex items-center gap-3 text-sm">
          {signedIn ? (
            <Link
              href="/dashboard"
              className="blueprint-border bg-ink px-4 py-2 font-medium text-paper transition-opacity hover:opacity-90"
            >
              Dashboard
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                className="px-3 py-2 font-medium text-ink underline-offset-2 hover:underline"
              >
                Sign in
              </Link>
              <Link
                href="/signup"
                className="blueprint-border bg-ink px-4 py-2 font-medium text-paper transition-opacity hover:opacity-90"
              >
                Create account
              </Link>
            </>
          )}
        </nav>
      </header>

      <main className="mx-auto max-w-5xl px-6 pb-20 pt-10 sm:pt-16">
        <p className="text-label text-ink-soft">For solo builders shipping with AI</p>
        <h1 className="mt-3 max-w-3xl font-display text-4xl font-bold tracking-tight text-ink sm:text-5xl">
          ScanCraft
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-ink-soft">
          Paste your live app URL. We check for the usual web security gaps —
          and the mistakes AI coding tools tend to ship — then give you a
          plain-English report with copy-paste fixes.
        </p>

        <div className="mt-10">
          <PreviewScanForm />
        </div>

        <section className="mt-16 grid gap-8 sm:grid-cols-3">
          <div>
            <h2 className="text-label text-ink">What we look for</h2>
            <p className="mt-2 text-sm text-ink-soft">
              Leaked API keys, open database access, missing login checks on
              admin pages, weak security headers, and more.
            </p>
          </div>
          <div>
            <h2 className="text-label text-ink">AI-tool blind spots</h2>
            <p className="mt-2 text-sm text-ink-soft">
              Things Lovable, Bolt, Cursor, v0, and Replit often miss — like
              Supabase tables anyone can read, or secret keys baked into the
              frontend.
            </p>
          </div>
          <div>
            <h2 className="text-label text-ink">Fixes you can use</h2>
            <p className="mt-2 text-sm text-ink-soft">
              Each finding includes a short explanation and a ready-to-paste
              code snippet or prompt for your AI coding tool.
            </p>
          </div>
        </section>

        <div className="mt-16 flex flex-wrap items-center gap-4 border-t border-grid pt-8">
          <Link
            href="/signup"
            className="blueprint-border bg-ink px-5 py-2.5 text-sm font-medium text-paper transition-opacity hover:opacity-90"
          >
            Get started free
          </Link>
          <Link
            href="/pricing"
            className="text-sm font-medium text-ink underline-offset-2 hover:underline"
          >
            Pricing
          </Link>
          <p className="text-sm text-ink-soft">
            No credit card for the free preview or free tier.
          </p>
        </div>
      </main>
    </div>
  );
}
