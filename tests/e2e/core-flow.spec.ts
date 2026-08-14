import { expect, test } from "@playwright/test";
import { DANISH_NOTES, formatNotes, resetStorage } from "./fixtures";

/** docs/PLAN.md §20.2 core flow, and §24.1. */

test.beforeEach(async ({ page }) => {
  await resetStorage(page);
});

test("paste, format, verify, edit, reorder, preview updates", async ({ page }) => {
  await page.goto("/");

  // The entry screen is three elements and a focused textarea.
  const textarea = page.getByLabel("Dine noter");
  await expect(textarea).toBeFocused();

  await formatNotes(page, DANISH_NOTES);

  // Section count and types.
  const cards = page.locator("[data-section-card]");
  await expect(cards).toHaveCount(6);

  const preview = page.getByRole("region", { name: "Forhåndsvisning af nyhedsbrevet" });
  await expect(preview.locator(".nl-agenda")).toHaveCount(1);
  await expect(preview.locator(".nl-decisions")).toHaveCount(1);
  await expect(preview.locator(".nl-actions")).toHaveCount(1);
  await expect(preview.locator(".nl-notice-important")).toHaveCount(1);
  await expect(preview.locator(".nl-contact")).toHaveCount(1);
  await expect(preview.locator(".nl-closing")).toHaveCount(1);

  // Recognised header fields.
  await expect(page.getByLabel("Titel", { exact: true })).toHaveValue("Klubmøde august");
  await expect(page.getByLabel("Undertitel", { exact: true })).toHaveValue("Referat fra mødet");
  await expect(page.getByLabel("Dato", { exact: true })).toHaveValue("2026-08-14");
  await expect(page.getByLabel("Fra kl.")).toHaveValue("15:30");
  await expect(page.getByLabel("Til kl.")).toHaveValue("17:00");
  await expect(page.getByLabel("Sted", { exact: true })).toHaveValue("Lærerværelset");

  // The action item kept its owner and deadline.
  await expect(page.getByLabel("Ansvarlig", { exact: true }).first()).toHaveValue("Mette");
  await expect(page.getByLabel("Frist", { exact: true }).first()).toHaveValue("2026-09-01");

  // Editing the title reaches the preview within the 500 ms budget (§24.1.5).
  await page.getByLabel("Titel", { exact: true }).fill("Klubmøde september");
  await expect(preview.locator(".nl-title")).toHaveText("Klubmøde september", { timeout: 500 });

  // Reordering is a plain array move, and the preview follows.
  const firstBefore = await preview.locator(".nl-section").first().innerText();
  await cards.nth(1).getByRole("button", { name: "Flyt afsnittet op" }).click();
  await expect(async () => {
    expect(await preview.locator(".nl-section").first().innerText()).not.toBe(firstBefore);
  }).toPass();
});

test("the engine's decisions are all correctable", async ({ page }) => {
  await page.goto("/");
  await formatNotes(page);

  // A parsed agenda item is a real labelled form field, not a rich-text region.
  const item = page.getByLabel("Punkt 1").first();
  await item.fill("Godkendelse af sidste referat");
  await expect(
    page.getByRole("region", { name: "Forhåndsvisning af nyhedsbrevet" }).locator(".nl-agenda"),
  ).toContainText("Godkendelse af sidste referat");

  // A section can be deleted.
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .locator("[data-section-card]")
    .last()
    .getByRole("button", { name: "Slet afsnittet" })
    .click();
  await expect(page.locator("[data-section-card]")).toHaveCount(5);
});

test("a blank newsletter is a valid starting point", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Start med et tomt nyhedsbrev" }).click();
  await expect(page.getByLabel("Titel", { exact: true })).toHaveValue("");
  await expect(page.locator("[data-section-card]")).toHaveCount(1);
});

test("drafts survive a reload", async ({ page }) => {
  await page.goto("/");
  await formatNotes(page);
  await page.getByLabel("Titel", { exact: true }).fill("Gemt på tværs af reload");

  // Autosave is debounced at 600 ms; the status line is the observable signal.
  await expect(page.getByText(/^Gemt kl\./)).toBeVisible();

  await page.reload();
  await expect(page.getByText("Du har en gemt kladde")).toBeVisible();
  await page.getByRole("button", { name: "Fortsæt" }).click();
  await expect(page.getByLabel("Titel", { exact: true })).toHaveValue("Gemt på tværs af reload");
});

test("the raw-text view round trips", async ({ page }) => {
  await page.goto("/");
  await formatNotes(page);

  // Captured before switching: the editor pane is replaced by the raw view.
  const before = await page.locator("[data-section-card]").count();

  await page.getByRole("tab", { name: "Råtekst" }).click();
  const raw = page.getByLabel("Råtekst");
  await expect(raw).toHaveValue(/## DAGSORDEN/);
  // An action item's owner and deadline survive into the serialisation, which
  // is what makes the round trip lossless for what the parser can express.
  await expect(raw).toHaveValue(/Mette, frist 01\.09\.2026/);

  await page.getByRole("button", { name: "Formatér igen" }).click();
  await expect(page.getByRole("tab", { name: "Redigér" })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("[data-section-card]")).toHaveCount(before);
});
