import { describe, expect, test } from "bun:test";
import {
  formatDate,
  formatList,
  formatMetaLine,
  formatTime,
  formatTimeRange,
  parseIsoDate,
  sortByLocale,
  toIsoDate,
} from "../../../src/lib/i18n/format";

/** docs/PLAN.md §8.6 — the exact outputs, pinned as assertions. */

const DATE = "2026-08-14";

describe("dates", () => {
  /**
   * The short and time forms are the acceptance criteria of §24.2.7 and are
   * asserted exactly. The `full` form is matched by pattern instead: ICU has
   * changed the comma in `Friday, 14 August 2026` between releases, and pinning
   * punctuation would make the suite fail on a browser rather than on a bug.
   * What must hold is the word order, the language of the month name, and that
   * neither locale ever reads month-first.
   */
  test("Danish full, long and short forms", () => {
    expect(formatDate(DATE, "da", "full")).toMatch(/^fredag den 14\.\s?august 2026$/);
    expect(formatDate(DATE, "da", "long")).toBe("14. august 2026");
    expect(formatDate(DATE, "da", "short")).toBe("14.08.2026");
  });

  test("English full, long and short forms", () => {
    expect(formatDate(DATE, "en", "full")).toMatch(/^Friday,? 14 August 2026$/);
    expect(formatDate(DATE, "en", "long")).toBe("14 August 2026");
    expect(formatDate(DATE, "en", "short")).toBe("14/08/2026");
  });

  test("an ISO date is a calendar date, not an instant", () => {
    const parsed = parseIsoDate(DATE);
    expect(parsed?.getFullYear()).toBe(2026);
    expect(parsed?.getMonth()).toBe(7);
    expect(parsed?.getDate()).toBe(14);
    expect(toIsoDate(parsed as Date)).toBe(DATE);
  });

  test("rejects impossible dates instead of rolling them over", () => {
    expect(parseIsoDate("2026-02-30")).toBeUndefined();
    expect(parseIsoDate("not-a-date")).toBeUndefined();
    expect(formatDate("2026-13-01", "da")).toBe("");
  });
});

describe("times", () => {
  test("Danish uses a full stop, English a colon", () => {
    expect(formatTime("15:30", "da")).toBe("15.30");
    expect(formatTime("15:30", "en")).toBe("15:30");
  });

  test("a range uses an en dash, and Danish prefixes kl. with a non-breaking space", () => {
    expect(formatTimeRange("15:30", "17:00", "da")).toBe("kl.\u00A015.30\u201317.00");
    expect(formatTimeRange("15:30", "17:00", "en")).toBe("15:30\u201317:00");
  });

  test("an open-ended range degrades to a single time", () => {
    expect(formatTimeRange("15:30", undefined, "da")).toBe("kl.\u00A015.30");
    expect(formatTimeRange(undefined, "17:00", "da")).toBe("");
  });
});

describe("meta line", () => {
  test("joins the parts that exist and drops the ones that do not", () => {
    expect(
      formatMetaLine(
        { date: DATE, timeStart: "15:30", timeEnd: "17:00", location: "Lærerværelset" },
        "da",
      ),
    ).toMatch(/^fredag den 14\.\s?august 2026 · kl\.\u00A015\.30\u201317\.00 · Lærerværelset$/);

    expect(formatMetaLine({ date: DATE }, "en")).toMatch(/^Friday,? 14 August 2026$/);
    expect(formatMetaLine({}, "da")).toBe("");
  });
});

describe("lists and collation", () => {
  test("Intl.ListFormat conjunctions", () => {
    expect(formatList(["Anne", "Bo", "Cecilie"], "da")).toBe("Anne, Bo og Cecilie");
    expect(formatList(["Anne", "Bo", "Cecilie"], "en")).toBe("Anne, Bo and Cecilie");
  });

  test("Danish sorts Æ Ø Å after Z", () => {
    const names = ["Åse", "Bo", "Zenia", "Æbler", "Anne"];
    expect(sortByLocale(names, "da", (n) => n)).toEqual(["Anne", "Bo", "Zenia", "Æbler", "Åse"]);
    // The naive comparison this replaces gets it wrong, which is the point.
    expect([...names].sort()).not.toEqual(["Anne", "Bo", "Zenia", "Æbler", "Åse"]);
  });
});
