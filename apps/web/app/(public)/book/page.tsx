import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Book a service",
};

export default async function BookIndexPage() {
  const services = await prisma.service.findMany({
    orderBy: { name: "asc" },
  });

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Book a service</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose a service to see available appointment times.
        </p>
      </div>

      {services.length === 0 ? (
        <p className="text-sm text-muted-foreground">No services are available to book yet.</p>
      ) : (
        <ul className="divide-y rounded-lg border" role="list">
          {services.map((service) => (
            <li key={service.id} className="flex items-center justify-between gap-4 px-4 py-4">
              <div>
                <p className="font-medium">{service.name}</p>
                {service.description ? (
                  <p className="mt-0.5 text-sm text-muted-foreground">{service.description}</p>
                ) : null}
              </div>
              <Button asChild variant="outline" size="sm">
                <Link href={`/book/${service.id}`}>View slots</Link>
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-8">
        <Button asChild variant="ghost" size="sm">
          <Link href="/">← Home</Link>
        </Button>
      </div>
    </main>
  );
}
