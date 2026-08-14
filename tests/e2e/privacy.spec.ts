import { expect, test } from "@playwright/test";
import { formatNotes, resetStorage } from "./fixtures";

/**
 * docs/PLAN.md §16.4 and §24.1.12.
 *
 * "No document content leaves the browser" is a product promise, so it is
 * enforced by interception rather than asserted in prose: the test fails on any
 * request beyond the app's own static assets during a full paste-edit-export
 * cycle.
 */

test.beforeEach(async ({ page }) => {
  await resetStorage(page);
});

test("no request leaves the origin during a full paste-edit-export cycle", async ({
  page,
  baseURL,
}) => {
  const foreign: string[] = [];

  page.on("request", (request) => {
    const url = request.url();
    if (url.startsWith("data:") || url.startsWith("blob:")) return;
    if (baseURL && url.startsWith(baseURL)) return;
    foreign.push(`${request.method()} ${url}`);
  });

  await page.goto("/");
  await formatNotes(page);

  await page.getByLabel("Titel", { exact: true }).fill("Fortroligt klubmøde");
  await page.getByLabel("Dokumentsprog").selectOption("en");

  await page.getByRole("button", { name: "Kopiér nyhedsbrev" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Luk", exact: true }).click();

  await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Hent Word (.docx)" }).click(),
  ]);

  await page.emulateMedia({ media: "print" });
  await page.emulateMedia({ media: "screen" });

  expect(foreign, `unexpected outbound requests:\n${foreign.join("\n")}`).toEqual([]);
});

test("no request carries the document's text", async ({ page }) => {
  const bodies: string[] = [];
  page.on("request", (request) => {
    const data = request.postData();
    if (data) bodies.push(data);
  });

  await page.goto("/");
  await formatNotes(page);
  await page.getByLabel("Titel", { exact: true }).fill("Personsag om en kollega");

  // Nothing in this app posts anything, anywhere.
  expect(bodies).toEqual([]);
});

test("the privacy page ships no JavaScript beyond the preference writer", async ({ page }) => {
  await page.goto("/privatliv");

  // No bundle, no module, no third-party tag.
  expect(await page.locator("script[src]").count()).toBe(0);
  expect(await page.locator('script[type="module"]').count()).toBe(0);

  // The only script on the page is the four-line preference writer of §9.4,
  // which keeps the static pages and the workspace in agreement about the
  // interface language after a switch made by following a link.
  const inline = await page.locator("script").allTextContents();
  expect(inline).toHaveLength(1);

  const source = inline[0] ?? "";
  expect(source).toContain("nl.uiLang");
  // Small, and provably incapable of talking to anything. The byte count
  // includes the explanatory comment, which is worth more than the bytes.
  expect(source.length).toBeLessThan(800);
  for (const forbidden of ["fetch(", "XMLHttpRequest", "import(", "navigator.send"]) {
    expect(source, `the preference writer must not use ${forbidden}`).not.toContain(forbidden);
  }

  // And it says the things it has to say.
  await expect(page.getByText("De er ikke krypterede")).toBeVisible();
  await expect(page.getByText("Brug ikke værktøjet til personsager")).toBeVisible();
  await expect(page.getByText("Safari sletter alle gemte data efter syv dage")).toBeVisible();
});

test("the English privacy page carries the same warning", async ({ page }) => {
  await page.goto("/en/privacy");
  await expect(page.getByText("They are not encrypted")).toBeVisible();
  await expect(
    page.getByText("Do not use this tool for individual member cases or health information."),
  ).toBeVisible();
});

test("the policy names only the app's own origin", async ({ page }) => {
  await page.goto("/");
  const csp = await page
    .locator('meta[http-equiv="content-security-policy" i]')
    .getAttribute("content");

  expect(csp).toBeTruthy();
  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("connect-src 'self'");
  expect(csp).toContain("form-action 'none'");
  expect(csp).toContain("base-uri 'none'");
  // Scripts stay hash-locked; nothing may be loaded from another origin.
  expect(csp).not.toContain("http://");
  expect(csp).not.toContain("https://");
  expect(csp).not.toContain("script-src 'self' 'unsafe-inline'");
});

test("deleting all stored data leaves no residue", async ({ page }) => {
  await page.goto("/");
  await formatNotes(page);
  await expect(page.getByText(/^Gemt kl\./)).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Åbn kladder" }).click();
  await page.getByRole("button", { name: "Slet alle gemte data" }).click();

  await page.waitForLoadState("load");
  await expect(page.getByRole("button", { name: "Formatér nyhedsbrev" })).toBeVisible();
  await expect(page.getByText("Du har en gemt kladde")).toHaveCount(0);

  const stored = await page.evaluate(() =>
    Object.keys(localStorage).filter((k) => k.startsWith("nl.")),
  );
  expect(stored).toEqual([]);
});
