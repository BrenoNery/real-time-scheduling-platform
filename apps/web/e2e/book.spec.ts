import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";

test.describe.configure({ mode: "serial" });

const CLIENT_PASSWORD = "e2e-client-password";

/** Registers a new client on the open booking form; unique emails keep reruns deterministic. */
async function fillNewClient(page: Page, name: string): Promise<void> {
  await page.locator("#book-name").fill(name);
  await page.locator("#book-email").fill(`e2e.${randomUUID()}@example.com`);
  await page.locator("#book-password").fill(CLIENT_PASSWORD);
}

async function openServiceSlots(page: Page, serviceName: string): Promise<void> {
  await page.goto("/book");
  await page
    .getByRole("listitem")
    .filter({ hasText: serviceName })
    .getByRole("link", { name: "View slots" })
    .click();
  await expect(page.getByRole("heading", { name: serviceName })).toBeVisible();
}

async function selectFirstAvailableSlot(page: Page): Promise<void> {
  const firstSlot = page.locator("button[aria-pressed]").first();
  await expect(firstSlot).toBeVisible();
  await firstSlot.click();
  await expect(firstSlot).toHaveAttribute("aria-pressed", "true");
}

test("books an available Consultation slot from /book", async ({ page }) => {
  await openServiceSlots(page, "Consultation");
  await selectFirstAvailableSlot(page);

  await fillNewClient(page, "E2E Success Client");
  await page.getByRole("button", { name: "Confirm booking" }).click();

  await expect(page.getByText("Booking confirmed.")).toBeVisible();
  // The session cookie now holds the client token, so the next booking needs no credentials.
  await expect(page.getByText("Booking as E2E Success Client")).toBeVisible();
});

test("shows Slot unavailable when a second client books the same Deep Dive slot", async ({
  browser,
}) => {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  try {
    await openServiceSlots(pageA, "Deep Dive Session");
    await openServiceSlots(pageB, "Deep Dive Session");

    await selectFirstAvailableSlot(pageA);
    await selectFirstAvailableSlot(pageB);

    await fillNewClient(pageA, "E2E Conflict First");
    await fillNewClient(pageB, "E2E Conflict Second");

    await pageA.getByRole("button", { name: "Confirm booking" }).click();
    await expect(pageA.getByText("Booking confirmed.")).toBeVisible();

    await pageB.getByRole("button", { name: "Confirm booking" }).click();
    await expect(pageB.getByText("Slot unavailable")).toBeVisible();
  } finally {
    await contextA.close();
    await contextB.close();
  }
});

test("dashboard requires a provider session", async ({ page }) => {
  await page.goto("/dashboard/bookings");
  await expect(page).toHaveURL(/\/login$/);

  await page.locator("#login-email").fill("provider@demo.local");
  await page.locator("#login-password").fill("demo-password");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(/\/dashboard$/);
  await page.getByRole("link", { name: "View Bookings →" }).click();
  await expect(page.getByRole("heading", { name: "Bookings" })).toBeVisible();
});
