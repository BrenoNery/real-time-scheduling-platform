import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function BookServiceNotFound() {
  return (
    <main className="mx-auto flex min-h-[50vh] max-w-lg flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      <h1 className="text-2xl font-bold tracking-tight">Service not found</h1>
      <p className="text-sm text-muted-foreground">
        This booking link may be outdated or the service was removed.
      </p>
      <Button asChild>
        <Link href="/book">Browse services</Link>
      </Button>
    </main>
  );
}
