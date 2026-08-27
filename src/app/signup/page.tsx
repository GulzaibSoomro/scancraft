import { Logo } from "@/components/logo";
import { AuthForm } from "@/components/auth-form";

export default function SignupPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 py-16">
      <Logo />
      <h1 className="mt-10 font-display text-3xl font-bold tracking-tight text-ink">
        Create your account
      </h1>
      <p className="mt-2 text-ink-soft">
        Free tier includes one full scan a month. Preview scans stay free — no
        card required.
      </p>
      <div className="mt-8">
        <AuthForm mode="signup" />
      </div>
    </main>
  );
}
