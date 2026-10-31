import type { Metadata } from "next";
import Link from "next/link";

import { ProviderLoginForm } from "@/components/auth/ProviderLoginForm";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Provider sign-in",
};

export default function LoginPage() {
  return (
    <main className="mx-auto max-w-md px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Provider sign-in</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Sign in with a provider account to open the dashboard.
        </p>
      </div>

      <section className="rounded-lg border bg-card p-6">
        <ProviderLoginForm />
      </section>

      <div className="mt-8">
        <Button asChild variant="ghost" size="sm">
          <Link href="/">← Home</Link>
        </Button>
      </div>
    </main>
  );
}
