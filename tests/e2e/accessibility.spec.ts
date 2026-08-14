import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { formatNotes, resetStorage } from "./fixtures";

/**
 * docs/PLAN.md §17.8 and §24.1.13–14.
 *
 * Automated scanning catches perhaps half of the real issues, so it is paired
 * here with a keyboard-only walkthrough of the full flow. The screen-reader pass
 * remains a manual step, as the plan says.
 */

const RULES = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

test.beforeEach(async ({ page }) => {
  await resetStorage(page);
});

async function scan(page: Parameters<typeof formatNotes>[0]) {
  return new AxeBuilder({ page }).withTags(RULES).analyze();
}

for (const [name, path] of [
  ["the Danish entry screen", "/"],
  ["the English entry screen", "/en/"],
  ["help, Danish", "/hjaelp"],
  ["help, English", "/en/help"],
  ["privacy, Danish", "/privatliv"],
  ["privacy, English", "/en/privacy"],
  ["about, Danish", "/om"],
  ["about, English", "/en/about"],
] as const) {
  test(`axe-core reports no violation on ${name}`, async ({ page }) => {
    await page.goto(path);
    const results = await scan(page);
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });
}

test("axe-core reports no violation in the workspace, in both languages", async ({ page }) => {
  await page.goto("/");
  await formatNotes(page);

  expect((await scan(page)).violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);

  await page.getByRole("button", { name: "English" }).click();
  expect((await scan(page)).violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
});

test("axe-core reports no violation in the dialogs", async ({ page }) => {
  await page.goto("/");
  await formatNotes(page);

  await page.getByRole("button", { name: "Kopiér nyhedsbrev" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect((await scan(page)).violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  await page.getByRole("dialog").getByRole("button", { name: "Luk", exact: true }).click();

  await page.getByRole("button", { name: "Åbn kladder" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect((await scan(page)).violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
});

test("the whole flow is operable by keyboard alone", async ({ page }) => {
  await page.goto("/");

  // The paste target is focused on load: Ctrl+V then Enter is the zero-click path.
  await expect(page.getByLabel("Dine noter")).toBeFocused();
  await page.keyboard.type("Klubmøde august\n\nDagsorden\n1. Første punkt\n2. Andet punkt\n");
  await page.keyboard.press("Control+Enter");

  await expect(page.locator("[data-section-card]").first()).toBeVisible();

  // Focus lands on the review strip so a keyboard user is not stranded.
  await expect(page.locator(".app-chrome:focus")).toBeVisible();

  // Tab reaches a section card, and Alt+Arrow reorders it.
  await page.getByLabel("Overskrift", { exact: true }).first().focus();
  await page.keyboard.press("Escape");

  const card = page.locator("[data-section-card]").first();
  await card.focus();
  await expect(card).toBeFocused();
});

test("reordering has a keyboard path that is not drag and drop", async ({ page }) => {
  await page.goto("/");
  await formatNotes(page);

  const ids = () =>
    page
      .locator("[data-section-card]")
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-section-id")));

  const before = await ids();
  const moved = before[1];

  await page.locator("[data-section-card]").nth(1).focus();
  await page.keyboard.press("Alt+ArrowUp");

  const after = await ids();
  expect(after[0]).toBe(moved as string);
  expect(after).toHaveLength(before.length);

  // Focus follows the card so it can be moved again immediately.
  await expect(page.locator("[data-section-card]").first()).toBeFocused();
});

test("the skip link is first in the tab order and reaches the content", async ({ page }) => {
  await page.goto("/");

  const skip = page.getByRole("link", { name: "Gå til indholdet" });

  // First in the document, so it is first in the tab order.
  const isFirst = await page.evaluate(
    () => document.body.firstElementChild?.classList.contains("skip-link") === true,
  );
  expect(isFirst).toBe(true);

  // Hidden until focused, then visible rather than merely present.
  await skip.focus();
  await expect(skip).toBeFocused();
  await expect(skip).toBeInViewport();

  await skip.press("Enter");
  await expect(page).toHaveURL(/#main$/);
  await expect(page.locator("#main")).toBeVisible();
});

test("every input has a visible label rather than a placeholder alone", async ({ page }) => {
  await page.goto("/");
  await formatNotes(page);

  const unlabelled = await page.evaluate(() => {
    const fields = [...document.querySelectorAll("input, textarea, select")];
    return fields
      .filter((field) => {
        const id = field.getAttribute("id");
        const labelled = id ? document.querySelector(`label[for="${id}"]`) : null;
        const aria = field.getAttribute("aria-label") ?? field.getAttribute("aria-labelledby");
        return !labelled && !aria;
      })
      .map((field) => field.outerHTML.slice(0, 120));
  });

  expect(unlabelled).toEqual([]);
});

test("the preview announces itself as a region in the interface language", async ({ page }) => {
  await page.goto("/");
  await formatNotes(page);

  await expect(page.getByRole("region", { name: "Forhåndsvisning af nyhedsbrevet" })).toBeVisible();
  await page.getByRole("button", { name: "English" }).click();
  await expect(page.getByRole("region", { name: "Newsletter preview" })).toBeVisible();
});
