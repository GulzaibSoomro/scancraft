import { Logo } from "@/components/logo";
import { AuthForm } from "@/components/auth-form";

export default function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string; next?: string };
}) {
  const authFailed = searchParams.error === "auth";

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 py-16">
      <Logo />
      <h1 className="mt-10 font-display text-3xl font-bold tracking-tight text-ink">
        Sign in
      </h1>
      <p className="mt-2 text-ink-soft">
        Pick up where you left off — scan history and projects stay on your
        account.
      </p>
      {authFailed && (
        <p
          role="alert"
          className="mt-4 border border-critical/40 bg-critical/5 px-3 py-2 text-sm text-critical"
        >
          Sign-in didn’t finish. The link may have expired — try again, or use
          email instead of GitHub.
        </p>
      )}
      <div className="mt-8">
        <AuthForm mode="login" />
      </div>
    </main>
  );
}
