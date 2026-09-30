import { expect, test, type Page } from "@playwright/test";

test.describe.configure({ mode: "serial" });

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

  await page.locator("#book-name").fill("E2E Success Client");
  await page.locator("#book-email").fill("e2e.success@example.com");
  await page.getByRole("button", { name: "Confirm booking" }).click();

  await expect(page.getByText("Booking confirmed.")).toBeVisible();
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

    await pageA.locator("#book-name").fill("E2E Conflict First");
    await pageA.locator("#book-email").fill("e2e.conflict@example.com");
    await pageB.locator("#book-name").fill("E2E Conflict Second");
    await pageB.locator("#book-email").fill("e2e.conflict2@example.com");

    await pageA.getByRole("button", { name: "Confirm booking" }).click();
    await expect(pageA.getByText("Booking confirmed.")).toBeVisible();

    await pageB.getByRole("button", { name: "Confirm booking" }).click();
    await expect(pageB.getByText("Slot unavailable")).toBeVisible();
  } finally {
    await contextA.close();
    await contextB.close();
  }
});
