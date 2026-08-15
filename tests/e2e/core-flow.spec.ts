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

  // A section can be deleted, from the card's own actions menu.
  const last = page.locator("[data-section-card]").last();
  await last.getByRole("button", { name: "Flere handlinger" }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await last.getByRole("menuitem", { name: "Slet afsnittet" }).click();
  await expect(page.locator("[data-section-card]")).toHaveCount(5);
});

test("a heading the parser invented can be undone in two named clicks", async ({ page }) => {
  await page.goto("/");
  // A lead-in whose list lost its numbering on the way out of Google Docs, with
  // one orphan short enough that the short-heading heuristic claims it.
  await formatNotes(
    page,
    [
      "Nyhedsbrev til klubben",
      "",
      "Vi holder MED-møde på fredag.",
      "",
      "Nyt fra kredsen",
      "Kredsen har udsendt Isfuglen med en orientering om besparelserne.",
      "",
      "Arbejdstid",
      "Vi talte længe om forberedelsestiden, og alle var enige om at følge op.",
      "",
    ].join("\n"),
  );

  const card = page.locator("[data-section-card]").last();
  await expect(card.getByLabel("Overskrift", { exact: true })).toHaveValue("Arbejdstid");

  await card.getByRole("button", { name: "Flere handlinger" }).click();
  await card.getByRole("menuitem", { name: "Gør overskriften til tekst" }).click();
  await expect(card.getByLabel("Overskrift", { exact: true })).toHaveValue("");

  const preview = page.getByRole("region", { name: "Forhåndsvisning af nyhedsbrevet" });
  await expect(preview).toContainText("Arbejdstid");

  // And the orphaned section joins the one it was split out of.
  const before = await page.locator("[data-section-card]").count();
  await card.getByRole("button", { name: "Flere handlinger" }).click();
  await card.getByRole("menuitem", { name: "Slå sammen med afsnittet ovenfor" }).click();
  await expect(page.locator("[data-section-card]")).toHaveCount(before - 1);
  await expect(preview).toContainText("Arbejdstid");

  // Both bodies now live under the heading the writer did mean.
  const merged = page.locator("[data-section-card]").last();
  await expect(merged.getByLabel("Overskrift", { exact: true })).toHaveValue("Nyt fra kredsen");
  await expect(merged).toContainText("Arbejdstid");
});

test("clicking an unfocused section body opens it with the caret where the pointer landed", async ({
  page,
}) => {
  // Two wrapped paragraphs, so the target word sits well inside the body: the
  // fallback drops the caret at the very end, and only an interior target can
  // tell the two outcomes apart.
  const paragraph = [
    "Vi drøftede forberedelsestiden indgående på mødet, og flere kolleger fortalte",
    "om arbejdstidsaftalen og om, hvordan medarbejderrepræsentanterne oplever",
    "presset i hverdagen på skolerne. Kredsen følger op på næste møde, og",
    "formanden lovede et udkast til en arbejdsgruppe inden efterårsferien.",
  ].join(" ");

  await page.goto("/");
  await formatNotes(
    page,
    ["Nyhedsbrev til klubben", "", "Nyt fra kredsen", paragraph, "", paragraph, ""].join("\n"),
  );

  const card = page.locator("[data-section-card]").last();
  const stand = card.locator("button.nl-editor");
  await stand.scrollIntoViewIfNeeded();

  // Measured from the rendered layout rather than guessed: the point has to be
  // a real glyph in the static stand-in for the click to mean anything.
  const point = await stand.evaluate((element, word) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const index = (node.textContent ?? "").indexOf(word);
      if (index === -1) continue;
      const range = document.createRange();
      range.setStart(node, index);
      range.setEnd(node, index + word.length);
      const box = range.getBoundingClientRect();
      return { x: Math.round(box.left) + 1, y: Math.round(box.top + box.height / 2) };
    }
    return null;
  }, "formanden");
  // Thrown rather than asserted: a silent fallback click on the viewport corner
  // would report a broken fixture as a mount failure.
  if (!point) throw new Error('the static stand-in never rendered the word "formanden"');

  await page.mouse.click(point.x, point.y);

  // The mount itself is under test: an `$effect` that reads the state it writes
  // destroys each instance as it creates it, and the section stays a dead
  // rectangle no keystroke ever reaches.
  const surface = card.locator(".nl-editor-surface");
  await expect(surface).toBeVisible();
  await expect(surface).toBeFocused();

  // And the caret is where the user aimed, not at the end of the body. Scoped
  // to the paragraph that was clicked: the two paragraphs are identical, so an
  // assertion over the whole surface would accept a miss of exactly one
  // paragraph — which is the shape a layout shift during the mount would take.
  await page.keyboard.type("HER");
  await expect(surface.locator("p").first()).toContainText("HERformanden");
  await expect(surface).not.toContainText("efterårsferien.HER");
});

test("the greeting field is big enough to hold a greeting", async ({ page }) => {
  await page.goto("/");
  await formatNotes(page);

  const intro = page.getByLabel("Indledning", { exact: true });
  const initial = (await intro.boundingBox())?.height ?? 0;
  // Five rows of the body face, not two.
  expect(initial).toBeGreaterThan(100);

  await intro.fill(`${"Kære kolleger. ".repeat(40)}`);
  await expect(async () => {
    expect((await intro.boundingBox())?.height ?? 0).toBeGreaterThan(initial);
  }).toPass();
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
