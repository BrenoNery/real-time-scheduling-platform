export function formatSlotTimeRange(startsAt: Date, endsAt: Date): string {
  const formatter = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });

  return `${formatter.format(startsAt)} – ${formatter.format(endsAt)} UTC`;
}
