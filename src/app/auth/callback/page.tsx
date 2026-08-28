import { Suspense } from "react";
import AuthCallbackClient from "./callback-client";

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 py-16">
          <p className="text-ink-soft">Finishing sign-in…</p>
        </main>
      }
    >
      <AuthCallbackClient />
    </Suspense>
  );
}
