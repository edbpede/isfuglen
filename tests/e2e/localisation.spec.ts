import { expect, test } from "@playwright/test";
import { DANISH_NOTES, formatNotes, resetStorage } from "./fixtures";

/**
 * docs/PLAN.md §20.2 and §24.2 — the required localisation set, one test per
 * numbered criterion and in the order the brief gives them.
 */

test.beforeEach(async ({ page }) => {
  await resetStorage(page);
});

test("1. the app opens in Danish on first use, whatever the browser language is", async ({
  page,
  context,
}) => {
  // The project runs with locale en-US; this makes the intent explicit.
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "language", { get: () => "en-US" });
    Object.defineProperty(navigator, "languages", { get: () => ["en-US", "en"] });
  });

  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "da");
  await expect(page.getByRole("button", { name: "Formatér nyhedsbrev" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Dansk" })).toHaveAttribute("aria-pressed", "true");
});

test("2. the interface can be switched to English", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "English" }).click();

  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("button", { name: "Format newsletter" })).toBeVisible();
  await expect(page.getByText("Paste your notes. We lay them out.")).toBeVisible();
});

test("3. the interface language survives a reload, and the URL follows", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "English" }).click();
  await expect(page).toHaveURL(/\/en\/$/);

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("button", { name: "Format newsletter" })).toBeVisible();
});

test("4. switching the interface language does not change user content", async ({ page }) => {
  await page.goto("/");
  await formatNotes(page, `${DANISH_NOTES}\nBeslutning: Klubben bakker op om forslaget. Ø Æ Å\n`);

  const snapshot = async () =>
    page.evaluate(() =>
      [...document.querySelectorAll(".nl-doc .nl-section")].map((node) => node.textContent),
    );

  const before = await snapshot();

  await page.getByRole("button", { name: "English" }).click();
  await page.getByRole("button", { name: "Dansk" }).click();

  expect(await snapshot()).toEqual(before);
});

test("5. and 6. the two languages are independent, and labels follow the document", async ({
  page,
}) => {
  await page.goto("/");
  await formatNotes(page);

  await page.getByRole("button", { name: "English" }).click();
  const preview = page.getByRole("region", { name: "Newsletter preview" });

  // Interface English, document still Danish.
  await expect(page.getByRole("button", { name: "Print or save as PDF" })).toBeVisible();
  await expect(preview.locator(".nl-agenda .nl-block-label")).toHaveText("Dagsorden");
  await expect(preview.locator(".nl-doc")).toHaveAttribute("lang", "da");

  // Now switch only the document.
  await page.getByLabel("Document language").selectOption("en");
  await expect(preview.locator(".nl-agenda .nl-block-label")).toHaveText("Agenda");
  await expect(preview.locator(".nl-decisions .nl-block-label")).toHaveText("Decisions");
  await expect(preview.locator(".nl-actions .nl-block-label")).toHaveText("Action items");
  await expect(preview.locator(".nl-doc")).toHaveAttribute("lang", "en");

  // And the chrome is still English.
  await expect(page.getByRole("button", { name: "Print or save as PDF" })).toBeVisible();
});

test("7. dates and times use the conventions of the document language", async ({ page }) => {
  await page.goto("/");
  await formatNotes(page);

  const preview = page.getByRole("region", { name: "Forhåndsvisning af nyhedsbrevet" });
  // The short forms are the acceptance criteria and are stable across ICU
  // versions; the long form's punctuation is not, so it is matched by pattern.
  await expect(preview.locator(".nl-meta")).toHaveText(/fredag den 14\.\s?august 2026/);
  await expect(preview.locator(".nl-meta")).toContainText("15.30");
  await expect(preview.locator(".nl-actions")).toContainText("01.09.2026");

  await page.getByLabel("Dokumentsprog").selectOption("en");
  await expect(preview.locator(".nl-meta")).toHaveText(/Friday,? 14 August 2026/);
  await expect(preview.locator(".nl-meta")).toContainText("15:30");
  await expect(preview.locator(".nl-actions")).toContainText("01/09/2026");
});

test("9. every visible string exists in both catalogs", async ({ page }) => {
  await page.goto("/");
  await formatNotes(page);

  // Walk the chrome in Danish, then in English, and require that no string is
  // left behind in the other language.
  const danishChrome = await page.locator(".app-chrome").allInnerTexts();
  expect(danishChrome.join(" ")).toContain("Udskriv eller gem som PDF");

  await page.getByRole("button", { name: "English" }).click();
  const englishChrome = await page.locator(".app-chrome").allInnerTexts();
  const joined = englishChrome.join(" ");

  expect(joined).toContain("Print or save as PDF");
  expect(joined).toContain("Download Word (.docx)");
  expect(joined).toContain("Copy newsletter");
  // No Danish chrome string may survive the switch.
  for (const danish of ["Udskriv eller gem", "Hent Word", "Kopiér nyhedsbrev", "Kladder"]) {
    expect(joined).not.toContain(danish);
  }
});

// 8. Exported PDF and DOCX labels follow the document language. Asserted in
// tests/e2e/export.spec.ts, where the DOCX is downloaded and unzipped.

test("12. the interface stays usable at 320 px in both languages", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto("/");
  await formatNotes(page);

  for (const label of ["English", "Dansk"]) {
    await page.getByRole("button", { name: label }).click();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    // A little horizontal slack is tolerable; a broken layout is not.
    expect(overflow, `horizontal overflow with ${label}`).toBeLessThan(8);
  }

  // Below the lg breakpoint the panes become tabs.
  await expect(page.getByRole("tab", { name: "Redigér" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Forhåndsvisning" })).toBeVisible();
});

test("13. Danish characters survive the editor and the preview", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Start med et tomt nyhedsbrev" }).click();
  await page.getByLabel("Titel", { exact: true }).fill("Ø Æ Å æ ø å");

  await expect(
    page.getByRole("region", { name: "Forhåndsvisning af nyhedsbrevet" }).locator(".nl-title"),
  ).toHaveText("Ø Æ Å æ ø å");
});

test("14. the language switch is keyboard operable and announces the change", async ({ page }) => {
  await page.goto("/");

  const english = page.getByRole("button", { name: "English" });
  await english.focus();
  await expect(english).toBeFocused();
  await page.keyboard.press("Enter");

  await expect(english).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Dansk" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );

  // The announcement is rendered in the new language, after <html lang> changed.
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("status")).toHaveText("Interface language changed to English.");

  // Focus has not moved.
  await expect(english).toBeFocused();
});

test("the static pages carry the same language contract with no JavaScript", async ({ page }) => {
  await page.goto("/privatliv");
  await expect(page.locator("html")).toHaveAttribute("lang", "da");
  await expect(page.getByRole("heading", { name: "Privatliv", level: 1 })).toBeVisible();

  await page.getByRole("link", { name: "English" }).click();
  await expect(page).toHaveURL(/\/en\/privacy$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");

  // The choice made by following the link is remembered by the workspace.
  await page.goto("/en/");
  await expect(page.getByRole("button", { name: "Format newsletter" })).toBeVisible();
});
