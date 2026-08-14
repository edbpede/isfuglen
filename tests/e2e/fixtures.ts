import type { Page } from "@playwright/test";

/** The Danish meeting notes used across the end-to-end suite. */
export const DANISH_NOTES = `Klubmøde august
Referat fra mødet
fredag den 14. august 2026, kl. 15.30-17.00, Lærerværelset

Kære kolleger. Her er et kort referat fra klubmødet.

Dagsorden
1. Godkendelse af referat
2. Nyt fra kredsen (v/ Mette, 10 min.)
3. Arbejdstid

Beslutninger
- Klubben bakker op om forslaget.
- Vi holder et ekstra møde i september.

Handlinger
- Indkalde til møde om arbejdstid (Ansvarlig: Mette, frist 01.09.2026)
- Sende referat til alle – Jens, senest 20.08.2026

Frist for tilmelding er 20. august.

Kontakt
Mette Hansen · mette@ishoejlaererkreds.dk

Med venlig hilsen
Ishøj Lærerkreds
Kreds 18
`;

/** Long enough to paginate to three pages at A4. */
export function longNotes(sections = 14): string {
  const body = [
    "Vi drøftede forberedelsestiden indgående, og flere kolleger fortalte om",
    "arbejdstidsaftalen og om, hvordan medarbejderrepræsentanterne oplever",
    "presset i hverdagen. Der var enighed om at følge op på næste møde.",
  ].join(" ");

  const parts = [DANISH_NOTES];
  for (let index = 0; index < sections; index += 1) {
    parts.push(`\nPunkt ${index + 1}\n${body}\n${body}\n`);
  }
  return parts.join("\n");
}

/** Pastes notes on the entry screen and formats them. */
export async function formatNotes(page: Page, notes = DANISH_NOTES): Promise<void> {
  await page.getByLabel(/Dine noter|Your notes/).fill(notes);
  await page.getByRole("button", { name: /Formatér nyhedsbrev|Format newsletter/ }).click();
  await page.getByRole("region", { name: /Forhåndsvisning|preview/i }).waitFor();
}

/**
 * Clears every stored preference and draft before a test's *first* navigation.
 *
 * `addInitScript` runs on every load, including a reload, so the guard matters:
 * without it the reload-persistence test would wipe the draft it is meant to
 * find. `sessionStorage` survives a reload in the same tab, which is exactly the
 * scope needed.
 */
export async function resetStorage(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      if (sessionStorage.getItem("nl.test.reset") === "1") return;
      sessionStorage.setItem("nl.test.reset", "1");
      localStorage.clear();
      indexedDB.deleteDatabase("keyval-store");
    } catch {
      /* Storage may be unavailable; the test will surface that on its own. */
    }
  });
}
