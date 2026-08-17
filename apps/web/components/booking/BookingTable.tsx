import type { BookingStatus, Prisma } from "@repo/database";

import { BookingActions } from "@/components/booking/BookingActions";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type BookingWithDetails = Prisma.BookingGetPayload<{
  include: {
    slot: { include: { service: true } };
    client: true;
  };
}>;

const STATUS_LABELS: Record<BookingStatus, string> = {
  CONFIRMED: "Confirmed",
  CANCELLED: "Cancelled",
  COMPLETED: "Completed",
};

function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(date);
}

interface BookingTableProps {
  bookings: BookingWithDetails[];
}

export function BookingTable({ bookings }: BookingTableProps) {
  if (bookings.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
        <p className="text-lg font-medium text-muted-foreground">No bookings yet</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Bookings will appear here once they are created.
        </p>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Service</TableHead>
          <TableHead>Slot Time</TableHead>
          <TableHead>Client</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Booked At</TableHead>
          <TableHead className="w-[120px]">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {bookings.map((booking) => (
          <TableRow key={booking.id}>
            <TableCell className="font-medium">{booking.slot.service.name}</TableCell>
            <TableCell className="whitespace-nowrap">
              {formatDateTime(booking.slot.startsAt)}
              {" \u2013 "}
              {formatDateTime(booking.slot.endsAt)}
            </TableCell>
            <TableCell>{booking.client.name}</TableCell>
            <TableCell>{STATUS_LABELS[booking.status]}</TableCell>
            <TableCell className="whitespace-nowrap">{formatDateTime(booking.bookedAt)}</TableCell>
            <TableCell>
              <BookingActions bookingId={booking.id} status={booking.status} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
