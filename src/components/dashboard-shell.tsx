import Link from "next/link";
import { Logo } from "@/components/logo";
import { signOut } from "@/app/auth/actions";

type Props = {
  email?: string | null;
  tier?: "free" | "pro";
  children: React.ReactNode;
};

export function DashboardShell({ email, tier = "free", children }: Props) {
  return (
    <div className="min-h-screen">
      <header className="blueprint-border border-x-0 border-t-0 bg-surface/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Logo href="/dashboard" />
          <nav className="flex items-center gap-3 text-sm sm:gap-4">
            <Link
              href="/dashboard"
              className="font-medium text-ink underline-offset-2 hover:underline"
            >
              Dashboard
            </Link>
            <Link
              href="/dashboard/billing"
              className="font-medium text-ink underline-offset-2 hover:underline"
            >
              Billing
            </Link>
            <span
              className="hidden border border-ink/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-ink-soft sm:inline"
              title={`Plan: ${tier}`}
            >
              {tier}
            </span>
            <span className="hidden text-ink-soft md:inline" title={email ?? undefined}>
              {email ?? "Signed in"}
            </span>
            <form action={signOut}>
              <button
                type="submit"
                className="blueprint-border bg-surface px-3 py-1.5 text-sm text-ink transition-colors hover:bg-paper"
              >
                Sign out
              </button>
            </form>
          </nav>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</div>
    </div>
  );
}
