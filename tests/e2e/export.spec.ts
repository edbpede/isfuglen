import { expect, test } from "@playwright/test";
import JSZip from "jszip";
import { formatNotes, longNotes, resetStorage } from "./fixtures";

/** docs/PLAN.md §20.2 export, and §24.1.6, §24.1.8–10. */

test.beforeEach(async ({ page }) => {
  await resetStorage(page);
});

test("the Paged.js path paginates a multi-page document", async ({ page }) => {
  await page.goto("/");
  await formatNotes(page, longNotes());

  const preview = page.getByRole("region", { name: "Forhåndsvisning af nyhedsbrevet" });
  const pages = preview.locator(".pagedjs_page");

  await expect(pages.first()).toBeVisible();
  const count = await pages.count();
  expect(count).toBeGreaterThan(1);

  // The fallback notice must not be showing on this path.
  await expect(page.getByText("Sidedeling med sidetal er ikke tilgængelig")).toHaveCount(0);

  // The running footer carries the organisation and a real page number.
  const footer = await preview.evaluate((root) => {
    const box = root.querySelector(
      ".pagedjs_page .pagedjs_margin-bottom-right .pagedjs_margin-content",
    );
    const left = root.querySelector(
      ".pagedjs_page .pagedjs_margin-bottom-left .pagedjs_margin-content",
    );
    return {
      page: box ? getComputedStyle(box, "::after").content : "",
      organisation: left ? getComputedStyle(left, "::after").content : "",
    };
  });
  // `counter(pages)` does not survive the paginated markup being moved into the
  // preview, so the total comes from a property the app sets itself.
  expect(footer.page).toContain(String(count));
  expect(footer.organisation).toContain("Ishøj Lærerkreds");

  // Every section appears exactly once, and in the order it was written.
  const headings = await preview.locator(".pagedjs_page .nl-h2").allInnerTexts();
  expect(new Set(headings).size).toBe(headings.length);
  expect(headings).toEqual(
    [...headings].sort((a, b) => Number(a.replace(/\\D/g, "")) - Number(b.replace(/\\D/g, ""))),
  );

  // And every heading sits inside its page box rather than clipped past the
  // bottom of it. This is the failure a paginated preview hides: the content is
  // all present in the DOM, but a page overflows and the next one starts the
  // document over.
  const clipped = await preview.evaluate((root) =>
    [...root.querySelectorAll(".pagedjs_page")].flatMap((box) => {
      const bounds = box.getBoundingClientRect();
      return [...box.querySelectorAll(".nl-h2")]
        .filter((heading) => {
          const rect = heading.getBoundingClientRect();
          return rect.top < bounds.top - 1 || rect.bottom > bounds.bottom + 1;
        })
        .map((heading) => heading.textContent);
    }),
  );
  expect(clipped).toEqual([]);

  // No heading is the last rendered element on a page.
  const stranded = await preview.evaluate(
    (root) =>
      [...root.querySelectorAll(".pagedjs_page")].filter((box) => {
        const content = box.querySelector(".pagedjs_page_content");
        const last = content?.lastElementChild;
        return last?.className?.toString().includes("nl-h2") === true;
      }).length,
  );
  expect(stranded).toBe(0);
});

test("the print stylesheet hides the application chrome", async ({ page }) => {
  await page.goto("/");
  await formatNotes(page);

  await page.emulateMedia({ media: "print" });

  const header = page.locator("header.app-chrome").first();
  await expect(header).toBeHidden();
  await expect(page.getByRole("button", { name: "Hent PDF" })).toBeHidden();

  // The document itself is still there, and still selectable text.
  await expect(page.locator(".nl-title").first()).toContainText("Klubmøde august");
});

test("the fallback path is honest when Paged.js cannot load", async ({ page }) => {
  // §24.1.7: the mandatory degradation path, tested against its own weaker bar.
  // The chunk is named by `manualChunks` in astro.config.mjs, so this blocks
  // exactly the lazily imported paginator and nothing else.
  await page.route("**/_astro/pagedjs.*.js", (route) => route.abort());

  await page.goto("/");
  await formatNotes(page);

  const preview = page.getByRole("region", { name: "Forhåndsvisning af nyhedsbrevet" });
  await expect(page.getByText("Sidedeling med sidetal er ikke tilgængelig")).toBeVisible();

  // Every section still appears exactly once, in order, with nothing lost.
  await expect(preview.locator(".nl-agenda")).toHaveCount(1);
  await expect(preview.locator(".nl-decisions")).toHaveCount(1);
  await expect(preview.locator(".nl-actions")).toHaveCount(1);
  await expect(preview.locator(".nl-contact")).toHaveCount(1);
  await expect(preview.locator(".nl-closing")).toHaveCount(1);
  await expect(preview.locator(".nl-title")).toContainText("Klubmøde august");

  // Page numbers and widow control are deliberately not asserted here: they are
  // exactly what this path gives up.
});

test("DOCX export downloads a real OOXML package in the document language", async ({ page }) => {
  await page.goto("/");
  await formatNotes(page);

  const download = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Hent Word (.docx)" }).click(),
  ]).then(([event]) => event);

  expect(download.suggestedFilename()).toBe("klubmoede-august-2026-08-14.docx");

  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  const zip = await JSZip.loadAsync(Buffer.concat(chunks));

  const document = await zip.file("word/document.xml")?.async("string");
  expect(document).toBeDefined();
  expect(document).toContain("Klubmøde august");
  expect(document).toContain("DAGSORDEN");
  expect(document).toContain("HANDLINGER");
  expect(document).toContain('w:val="da-DK"');
  expect(document).toContain("Lærerværelset");

  // The header carries the build-time logo raster.
  const media = Object.keys(zip.files).filter((name) => name.startsWith("word/media/"));
  expect(media.length).toBeGreaterThan(0);
});

test("DOCX export follows a switched document language", async ({ page }) => {
  await page.goto("/");
  await formatNotes(page);
  await page.getByLabel("Dokumentsprog").selectOption("en");

  const download = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Hent Word (.docx)" }).click(),
  ]).then(([event]) => event);

  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  const zip = await JSZip.loadAsync(Buffer.concat(chunks));
  const document = (await zip.file("word/document.xml")?.async("string")) ?? "";

  expect(document).toContain("AGENDA");
  expect(document).toContain("ACTION ITEMS");
  expect(document).toContain('w:val="en-GB"');
  expect(document).not.toContain('w:val="da-DK"');
});

test("copy writes both clipboard flavours", async ({ page }) => {
  await page.goto("/");
  await formatNotes(page);

  await page.getByRole("button", { name: "Kopiér nyhedsbrev" }).click();
  await expect(page.getByText("Sæt ind i Word, Outlook eller Gmail")).toBeVisible();

  const flavours = await page.evaluate(async () => {
    const items = await navigator.clipboard.read();
    const item = items[0];
    if (!item) return { html: "", text: "" };
    const html = item.types.includes("text/html")
      ? await (await item.getType("text/html")).text()
      : "";
    const text = item.types.includes("text/plain")
      ? await (await item.getType("text/plain")).text()
      : "";
    return { html, text };
  });

  expect(flavours.html).toContain("<h1");
  expect(flavours.html).toContain("<table");
  expect(flavours.html).not.toContain("class=");
  expect(flavours.html).toContain("Klubmøde august");

  expect(flavours.text).toContain("## DAGSORDEN");
  expect(flavours.text).toContain("Mette, frist 01.09.2026");
  expect(flavours.text).toContain("Lærerværelset");
});

test("the copy dialog states what does not survive the clipboard", async ({ page }) => {
  await page.goto("/");
  await formatNotes(page);
  await page.getByRole("button", { name: "Kopiér nyhedsbrev" }).click();

  await expect(page.getByText("Overskrifter, lister, links og farver følger med.")).toBeVisible();
  await expect(page.getByText("Logo og sidefod følger ikke med")).toBeVisible();
});
