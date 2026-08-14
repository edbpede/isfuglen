import { describe, expect, test } from "bun:test";
import { sectionBodyExtensions, stripAlienStyles } from "../../../src/lib/editor/schema";
import { safeHref } from "../../../src/lib/render/html";

/** docs/PLAN.md §7.1, §7.4 — the schema is a constraint, so assert the constraint. */

function linkOptions() {
  const link = sectionBodyExtensions("Skriv her …").find((ext) => ext.name === "link");
  if (!link) throw new Error("the section body schema no longer carries a link mark");
  return link.options as { isAllowedUri: (uri: string) => boolean };
}

describe("link destinations", () => {
  const { isAllowedUri } = linkOptions();

  test("the editor accepts exactly what the renderer will render", () => {
    // The drift this guards against is silent: TipTap's `protocols` option only
    // *adds* to a built-in list, so a link accepted here but refused by
    // `renderInline` would vanish from the preview beside it.
    for (const uri of [
      "https://kreds18.dk",
      "http://x.dk",
      "mailto:mette@kreds18.dk",
      "tel:+4512345678",
      "/relativ",
      "javascript:alert(1)",
      "JaVaScRiPt:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "vbscript:msgbox(1)",
      "ftp://x.dk/fil",
      "sms:12345678",
    ]) {
      expect(isAllowedUri(uri), uri).toBe(safeHref(uri) !== undefined);
    }
  });

  test("the schemes a newsletter recipient can act on, and no others", () => {
    for (const uri of ["https://kreds18.dk", "http://x.dk", "mailto:a@x.dk", "tel:+4512345678"]) {
      expect(isAllowedUri(uri), uri).toBe(true);
    }
    for (const uri of ["javascript:alert(1)", "data:text/html,x", "ftp://x.dk/f", "sms:123"]) {
      expect(isAllowedUri(uri), uri).toBe(false);
    }
  });
});

describe("stripAlienStyles", () => {
  test("removes the attributes a Word paste carries and the elements it hides", () => {
    const pasted =
      '<!--StartFragment--><p style="mso-line-height:1" class="MsoNormal" align="center">' +
      '<span face="Calibri" color="#FF0000">Tekst</span></p>' +
      "<style>.MsoNormal{margin:0}</style><script>alert(1)</script>";
    const cleaned = stripAlienStyles(pasted);
    expect(cleaned).not.toContain("style=");
    expect(cleaned).not.toContain("class=");
    expect(cleaned).not.toContain("<style");
    expect(cleaned).not.toContain("<script");
    expect(cleaned).not.toContain("StartFragment");
    expect(cleaned).toContain("Tekst");
  });
});
