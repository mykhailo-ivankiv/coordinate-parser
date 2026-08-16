import { useState } from "react";
import { coordinateParser } from "./parsers/coordinateParser.ts";

// Grouped by the `system` coordinateParser actually reports, not by which parser module
// produced the match — the European variants are a spelling of WGS84, not a system of
// their own. The WGS84R examples use Sydney because its longitude is past 90°: anything
// readable as latitude first is claimed by WGS84 before the reversed branch is tried.
// MGRS yields a grid square rather than a latitude/longitude pair, so its result carries a
// different shape; the examples walk down its precision ladder, since dropping digits
// coarsens the reference instead of moving it.
type ExampleGroup = {
  system: string;
  /** What the acronym stands for. */
  fullName: string;
  description: string;
  /** The document the format is defined by, where one is worth linking. */
  spec?: { href: string; label: string };
  /** Prose for a group that needs more than the one-line description. */
  note?: string;
  inputs: { input: string; note: string }[];
};

const examples: ExampleGroup[] = [
  {
    system: "WGS84",
    fullName: "World Geodetic System 1984",
    description: "широта, потім довгота",
    inputs: [
      { input: "50.4501, 30.5234", note: "через кому" },
      { input: "50.4501 30.5234", note: "через пробіл" },
      { input: "50,4501 30,5234", note: "кома як десятковий знак, роздільник лише пробіл" },
    ],
  },
  {
    system: "WGS84R",
    fullName: "World Geodetic System 1984, зворотний порядок",
    description: "довгота, потім широта",
    note:
      "«R» тут — не частина назви стандарту, а позначення цієї бібліотеки для зворотного порядку " +
      "значень: сама система координат та сама, що й у WGS84.",
    inputs: [
      { input: "151.2093, -33.8688", note: "через кому" },
      { input: "151,2093 -33,8688", note: "кома як десятковий знак, роздільник лише пробіл" },
    ],
  },
  {
    system: "DD",
    fullName: "Decimal Degrees",
    description: "десяткові градуси з літерою півкулі",
    spec: { href: "https://www.iso.org/standard/75147.html", label: "ISO 6709" },
    note:
      "Те саме, що WGS84, але напрямок задає літера, а не знак: «33.8688°S» замість «-33.8688». " +
      "ISO 6709 описує обидва записи — знаковий машинний (Annex H, його читає WGS84) і цей " +
      "людиночитний (Annex D). Знак разом з літерою відхиляється: «-50.4501°S» задає напрямок " +
      "двічі. Знак градуса необов'язковий — він рідко є на клавіатурі, а літера й так однозначно " +
      "визначає формат.",
    inputs: [
      { input: "50.4501°N, 30.5234°E", note: "північ і схід" },
      { input: "33.8688°S, 151.2093°E", note: "південь — літера дає мінус" },
      { input: "40.7128°N, 74.0060°W", note: "захід — теж мінус" },
      { input: "50.4501N, 30.5234E", note: "без знака градуса" },
      { input: "90°S, 180°W", note: "полюс і антимеридіан" },
    ],
  },
  {
    system: "DDM",
    fullName: "Degrees and Decimal Minutes",
    description: "градуси й десяткові хвилини",
    spec: { href: "https://www.iso.org/standard/75147.html", label: "ISO 6709" },
    note:
      "Той самий Annex D, що й DD, лише один компонент нижче: дробова частина переїжджає з " +
      "градусів у хвилини. Мітка хвилин обов'язкова — саме вона відрізняє DDM від DD, тоді як знак " +
      "градуса лишається необов'язковим. Хвилини мусять бути менші за 60; 60 хвилин це вже градус.",
    inputs: [
      { input: "50° 27.006'N, 30° 31.404'E", note: "той самий Київ, що й у DD" },
      { input: "50°27.006'N, 30°31.404'E", note: "без пробілів" },
      { input: "50° 27.006′N, 30° 31.404′E", note: "друкарський штрих замість апострофа" },
      { input: "50° 27'N, 30° 31'E", note: "цілі хвилини" },
      { input: "90° 0'N, 180° 0'E", note: "полюс і антимеридіан" },
    ],
  },
  {
    system: "DMS",
    fullName: "Degrees, Minutes, Seconds",
    description: "градуси, хвилини й секунди",
    spec: { href: "https://www.iso.org/standard/75147.html", label: "ISO 6709" },
    note:
      "Найповніший запис родини Annex D. Хвилини тут цілі, а дробова частина переходить у " +
      "секунди — цим DMS і відділений від DDM. Кут зводиться до десяткових градусів перед " +
      "перевіркою меж, тож 90°0'0\"N валідний, а 90°0'1\"N ні, і жоден з них не є окремим " +
      "випадком у граматиці. Секунди приймають подвійні лапки, два апострофи або подвійний штрих.",
    inputs: [
      { input: `50° 27' 0.36"N, 30° 31' 24.24"E`, note: "той самий Київ" },
      { input: `50°27'0.36"N, 30°31'24.24"E`, note: "без пробілів" },
      { input: `50° 27' 0.36''N, 30° 31' 24.24''E`, note: "два апострофи замість лапок" },
      { input: `50° 27' 0.36″N, 30° 31' 24.24″E`, note: "друкарський подвійний штрих" },
      { input: `90° 0' 0"N, 180° 0' 0"E`, note: "полюс і антимеридіан" },
    ],
  },
  {
    system: "MGRS",
    fullName: "Military Grid Reference System",
    description: "квадрат сітки, а не пара координат",
    // BASE_URL, not a bare "/": vite.config.ts sets base to "/coordinate-parser/", so an absolute
    // path would 404 once the app is served from GitHub Pages.
    spec: {
      href: `${import.meta.env.BASE_URL}NGA_STND_0037_2.0.0_GRIDS.pdf`,
      label: "NGA.STND.0037",
    },
    inputs: [
      { input: "4QFJ1234567890", note: "точність 1 м" },
      { input: "4Q FJ 12345 67890", note: "те саме, через пробіли" },
      { input: "4QFJ12346789", note: "точність 10 м" },
      { input: "4QFJ1267", note: "точність 1 км" },
      { input: "4QFJ", note: "лише квадрат 100 км — MGRS так уміє, USNG ні" },
    ],
  },
  {
    system: "USNG",
    fullName: "United States National Grid",
    description: "та сама сітка, що й MGRS",
    spec: {
      href: "https://www.fgdc.gov/standards/projects/FGDC-standards-projects/usng/fgdc_std_011_2001_usng.pdf",
      label: "FGDC-STD-011-2001",
    },
    note:
      "USNG переймає сітку MGRS без змін, тож ці приклади розбираються обома парсерами й " +
      "позначаються як MGRS: системи різняться датумом (USNG на NAD 83, MGRS на WGS 84), а датум " +
      "у рядку не записаний — саме тому стандарт FGDC передбачив окремий суфікс «(NAD 27)». " +
      "Єдина відмінність, помітна в самому рядку: USNG вимагає щонайменше одну цифру на вісь, " +
      "тож найгрубіше USNG-посилання — квадрат 10 км, а голий квадрат 100 км є MGRS, але не USNG.",
    inputs: [
      { input: "10S GJ 06832 44683", note: "точність 1 м" },
      { input: "10SGJ0683244683", note: "та сама точка, формальний запис без пробілів" },
      { input: "10S GJ 06 44", note: "точність 1 км" },
      { input: "10S GJ 0 4", note: "квадрат 10 км — найгрубіше, що допускає USNG" },
      { input: "10S GJ", note: "вже не USNG: немає жодної цифри" },
    ],
  },
  {
    system: "UTM",
    fullName: "Universal Transverse Mercator",
    description: "проєкція, на якій стоять MGRS і USNG",
    spec: {
      href: `${import.meta.env.BASE_URL}NGA_STND_0037_2.0.0_GRIDS.pdf`,
      label: "NGA.STND.0037",
    },
    note:
      "Літера після номера зони читається як смуга широти C–X, так само як у MGRS та USNG вище: " +
      "смуги C–M лежать південніше екватора, N–X північніше, тож півкуля виводиться зі смуги. " +
      "Обережно з «17S»: тут це смуга S, тобто 32–40° північної широти, тоді як у EPSG та PROJ " +
      "той самий запис означає південну півкулю. Обидва прочитання реалізовані окремими " +
      "парсерами, і порядок у choice вирішує, яке переможе.",
    inputs: [
      { input: "36U 324000 5591000", note: "смуга U — Україна" },
      { input: "17T 630084 4833438", note: "смуга T, північ" },
      { input: "17M 630084 4833438", note: "смуга M, південь" },
      { input: "31N 630084 553000", note: "біля екватора — northing коротший за 7 цифр" },
      { input: "17T6300844833438", note: "суцільний запис, 6+7 цифр" },
    ],
  },
  {
    system: "UCS-2000",
    fullName: "Ukrainian Coordinate System 2000 · УСК-2000",
    description: "прямокутні координати, зона в Y",
    spec: { href: "https://epsg.io/5564", label: "EPSG:5564" },
    inputs: [
      { input: "5591000 6325000", note: "зона 6, повна форма" },
      { input: "55-91000 63-25000", note: "те саме, з групуванням" },
      { input: "5591000, 6325000", note: "через кому" },
      { input: "4985000 4380000", note: "зона 4 — захід України" },
    ],
  },
];

const CoordinateInput = () => {
  const [text, setText] = useState("");
  const result = coordinateParser.run(text);

  return (
    <div>
      <input
        type="text"
        className="p-2 w-full border rounded-sm"
        placeholder="Enter coordinates"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="mt-4 whitespace-pre-wrap text-sm font-mono">
        {JSON.stringify(result, null, 2)}
      </div>

      <p className="mt-3 text-sm">Ви можете вводити координати в наступних форматах:</p>
      {examples.map(({ system, fullName, description, spec, note, inputs }) => (
        <section key={system} className="mt-2 text-sm">
          <h3>
            <span className="font-bold">{system}</span>
            {spec && (
              <>
                <span className="opacity-60"> · </span>
                <a
                  href={spec.href}
                  target="_blank"
                  rel="noreferrer"
                  className="underline underline-offset-2 hover:no-underline"
                >
                  {spec.label}
                </a>
              </>
            )}
          </h3>
          <p className="opacity-60">
            {fullName} — {description}
          </p>
          {note && <p className="mt-1 opacity-60">{note}</p>}
          <ul className="mt-1 flex flex-col gap-1">
            {inputs.map(({ input, note }) => (
              <li key={input}>
                <button
                  type="button"
                  className="cursor-pointer font-mono underline underline-offset-2 hover:no-underline"
                  onClick={() => setText(input)}
                >
                  {input}
                </button>
                <span className="opacity-60"> — {note}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
};

function App() {
  return (
    <main className="max-w-[60ch] p-4 m-auto">
      <h2>Парсер координат</h2>
      <CoordinateInput />
    </main>
  );
}

export default App;
