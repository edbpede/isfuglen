import {
  actionItem,
  actions,
  agenda,
  agendaItem,
  closing,
  contact,
  contactEntry,
  createDoc,
  decisions,
  heading,
  link,
  list,
  notice,
  paragraph,
  quote,
  rich,
  section,
  text,
} from "../../../src/lib/model/factory";
import type { DocLang, NewsletterDoc } from "../../../src/lib/model/types";

/**
 * One document containing every block type, used by the renderer, clipboard and
 * DOCX tests so that "every block type" is a single definition rather than a
 * claim repeated in three files.
 */
export function everyBlockDoc(docLang: DocLang = "da"): NewsletterDoc {
  const doc = createDoc({
    docLang,
    title: "Klubmøde august",
    organisation: "Ishøj Lærerkreds",
    footerNote: "Kreds 18 · DLF",
  });

  doc.meta.subtitle = "Referat fra mødet";
  doc.meta.date = "2026-08-14";
  doc.meta.timeStart = "15:30";
  doc.meta.timeEnd = "17:00";
  doc.meta.location = "Lærerværelset";
  doc.intro = [
    text("Kære kolleger. Læs mere hos "),
    link("https://kreds18.dk", "kredsen"),
    text("."),
  ];

  doc.sections = [
    section("Indledning", [
      paragraph([
        text("Almindelig tekst med "),
        text("fed", ["bold"]),
        text(" og "),
        text("kursiv", ["italic"]),
        text("."),
      ]),
      heading("Underoverskrift", 3),
      list(["Første punkt", "Andet punkt"], false),
      list(["Et", "To"], true),
    ]),
    section(undefined, [
      agenda([agendaItem("Godkendelse af referat"), agendaItem("Nyt fra kredsen", "Mette", 10)]),
    ]),
    section(undefined, [decisions(["Klubben bakker op om forslaget."])]),
    section(undefined, [actions([actionItem("Indkalde til møde", "Mette", "2026-09-01")])]),
    section(undefined, [notice(rich("Frist for tilmelding er 20. august."), "important")]),
    section(undefined, [notice(rich("Kredsen holder generalforsamling i marts."), "info")]),
    section(undefined, [quote(rich("Vi skal have en aftale."), "Mette Hansen")]),
    section(undefined, [
      contact([
        contactEntry({
          name: "Mette Hansen",
          role: "Tillidsrepræsentant",
          email: "mette@ishoejlaererkreds.dk",
          phone: "12 34 56 78",
          url: "kreds18.dk",
        }),
      ]),
    ]),
    section(undefined, [closing(rich("Med venlig hilsen"), ["Ishøj Lærerkreds", "Kreds 18"])]),
  ];

  return doc;
}
