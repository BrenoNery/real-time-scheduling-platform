import type { Metadata } from "next";

import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Dashboard",
};

/**
 * Placeholder dashboard page (BRE-38).
 *
 * This is a static Server Component — no database query is made here yet.
 * The booking table with live SSR data will be added in BRE-40.
 *
 * `lib/db.ts` is wired up and ready; import `prisma` from there when
 * BRE-40 implements the bookings table.
 */
export default function DashboardPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="mt-3 max-w-md text-muted-foreground">
          The booking management table is coming in the next sprint. Server
          Components will query the database directly via Prisma for fully
          server-rendered HTML.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <Button asChild variant="outline">
          <a href="/">← Home</a>
        </Button>
        <Button disabled>View Bookings (coming soon)</Button>
      </div>
    </main>
  );
}
