import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Dashboard",
};

export default function DashboardPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="mt-3 max-w-md text-muted-foreground">
          Manage your bookings and services from one place.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <Button asChild variant="outline">
          <a href="/">← Home</a>
        </Button>
        <Button asChild>
          <Link href="/dashboard/bookings">View Bookings →</Link>
        </Button>
      </div>
    </main>
  );
}
