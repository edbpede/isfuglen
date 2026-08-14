import { describe, expect, test } from "bun:test";
import { findDate, findTime, isWeekdayWord, maskUris } from "../../../src/lib/parser/dates";

/** docs/PLAN.md §11.3 — every format in the table, plus the rejection cases. */

const TODAY = new Date(2026, 0, 1);

describe("Danish date formats", () => {
  const cases: [string, string][] = [
    ["14. august 2026", "2026-08-14"],
    ["d. 14. august 2026", "2026-08-14"],
    ["torsdag den 14. august 2026", "2026-08-14"],
    ["14/8 2026", "2026-08-14"],
    ["14/8-26", "2026-08-14"],
    ["14/08/2026", "2026-08-14"],
    ["14.08.2026", "2026-08-14"],
    ["14.8.26", "2026-08-14"],
    ["14-08-2026", "2026-08-14"],
    ["14. aug. 2026", "2026-08-14"],
  ];

  for (const [input, expected] of cases) {
    test(`reads ${input}`, () => {
      expect(findDate(input, "da", TODAY)?.iso).toBe(expected);
    });
  }

  test("assumes the current year when none is given", () => {
    const hit = findDate("14. august", "da", TODAY);
    expect(hit?.iso).toBe("2026-08-14");
    expect(hit?.yearAssumed).toBe(true);
  });

  test("reads ambiguous numeric dates day-first, never US order", () => {
    expect(findDate("03/04/2026", "da", TODAY)?.iso).toBe("2026-04-03");
  });

  test("expands two-digit years: <= 79 is 2000s, above is 1900s", () => {
    expect(findDate("14.08.79", "da", TODAY)?.iso).toBe("2079-08-14");
    expect(findDate("14.08.80", "da", TODAY)?.iso).toBe("1980-08-14");
  });

  test("leaves relative wording alone rather than guessing a date", () => {
    expect(findDate("i morgen", "da", TODAY)).toBeUndefined();
    expect(findDate("næste uge", "da", TODAY)).toBeUndefined();
  });

  test("rejects impossible dates", () => {
    expect(findDate("31.02.2026", "da", TODAY)).toBeUndefined();
  });
});

describe("English date formats", () => {
  test("reads a named month in either order", () => {
    expect(findDate("14 August 2026", "en", TODAY)?.iso).toBe("2026-08-14");
    expect(findDate("14 Aug 2026", "en", TODAY)?.iso).toBe("2026-08-14");
  });

  test("recognises Danish month names even in an English document", () => {
    expect(findDate("14. august 2026", "en", TODAY)?.iso).toBe("2026-08-14");
  });
});

describe("rejection cases", () => {
  test("a date inside a URL is not a date", () => {
    expect(findDate("https://kreds18.dk/nyt/14/8/2026", "da", TODAY)).toBeUndefined();
    expect(findDate("www.kreds18.dk/14.08.2026", "da", TODAY)).toBeUndefined();
  });

  test("a date inside an email address is not a date", () => {
    expect(findDate("referat14.08.2026@kreds18.dk", "da", TODAY)).toBeUndefined();
  });

  test("`1.1` is a numbering prefix, not a date", () => {
    expect(findDate("1.1 Godkendelse", "da", TODAY)).toBeUndefined();
  });

  test("maskUris blanks the ranges it removes so offsets stay valid", () => {
    const masked = maskUris("se https://a.dk/14/8 her");
    expect(masked.length).toBe("se https://a.dk/14/8 her".length);
    expect(masked.endsWith(" her")).toBe(true);
  });
});

describe("times", () => {
  const cases: [string, string, string | undefined][] = [
    ["kl. 15.30", "15:30", undefined],
    ["kl 15.30", "15:30", undefined],
    ["15.30", "15:30", undefined],
    ["kl. 15:30", "15:30", undefined],
    ["15:30", "15:30", undefined],
    ["kl. 15.30-17.00", "15:30", "17:00"],
    ["15.30 – 17", "15:30", "17:00"],
    ["kl. 15-17", "15:00", "17:00"],
  ];

  for (const [input, start, end] of cases) {
    test(`reads ${input}`, () => {
      const hit = findTime(input);
      expect(hit?.start).toBe(start);
      expect(hit?.end).toBe(end);
    });
  }

  test("rejects an impossible clock time", () => {
    expect(findTime("kl. 99:99")).toBeUndefined();
  });
});

describe("weekdays", () => {
  test("recognises full and abbreviated Danish weekdays", () => {
    expect(isWeekdayWord("fredag", "da")).toBe(true);
    expect(isWeekdayWord("tors.", "da")).toBe(true);
    expect(isWeekdayWord("Lørdag", "da")).toBe(true);
    expect(isWeekdayWord("Lærerværelset", "da")).toBe(false);
  });

  test("recognises English weekdays", () => {
    expect(isWeekdayWord("Thursday", "en")).toBe(true);
    expect(isWeekdayWord("wed", "en")).toBe(true);
  });
});
