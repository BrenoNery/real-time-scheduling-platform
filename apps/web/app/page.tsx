import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight">Real-Time Scheduling Platform</h1>
        <p className="mt-3 text-muted-foreground">
          Book appointments online or manage bookings from the dashboard.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button asChild>
          <Link href="/book">Book an appointment</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/dashboard">Go to Dashboard →</Link>
        </Button>
      </div>
    </main>
  );
}
