import { lazy, type ReactNode, Suspense, useState, useSyncExternalStore } from "react";
import {
  ArticleAboutCoordinateSystems,
  GuideContentsBar,
  GuideContentsSidebar,
} from "./ArticleAboutCoordinateSystems.tsx";

// Loaded on demand: the map library is most of the bundle, and the parser page has no use for it.
const ConverterPage = lazy(() =>
  import("./ConverterPage.tsx").then(({ ConverterPage }) => ({ default: ConverterPage })),
);
// Also on demand: the generated reference is data only this page needs.
const ApiPage = lazy(() => import("./ApiPage.tsx").then(({ ApiPage }) => ({ default: ApiPage })));
import { coordinateParser } from "@coordinate-parser/parser";
import type {
  MGRSCoordinate,
  UCS2000Coordinate,
  USNGCoordinate,
  UTMCoordinate,
  WGS84Coordinate,
} from "@coordinate-parser/types";
import { labelOf } from "./labels.ts";

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
      "USNG переймає сітку MGRS без змін, тож ці приклади парсяться обома парсерами й " +
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
      { input: "36U 324182 5591608", note: "смуга U — Київ, пораховано прямою проєкцією" },
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

// The quick picks above the field: one line of variety rather than one per system. They mix
// separators, decimal commas, hemisphere letters against signs, typographic primes against ASCII
// quotes, spaced and solid grid references and MGRS precisions, so a glance shows how loosely the
// parser reads. Each chip is labelled with what the parser itself reports, so a change in the
// grammar can never leave a label lying about its example.
const quickPicks = [
  "50.4501, 30.5234",
  "50,4501 30,5234",
  "-33.8688 151.2093",
  "151.2093, -33.8688",
  "33.8688°S, 151.2093°E",
  "40.7128N, 74.0060W",
  "50° 27.006′N, 30° 31.404′E",
  `50°27'0.36"N, 30°31'24.24"E`,
  "36UUA2418291607",
  "10S GJ 06832 44683",
  "4QFJ",
  "36U 324182 5591608",
  "17T6300844833438",
  "55-91000 63-25000",
].map((input) => {
  const parsed = coordinateParser.run(input);
  return { input, label: parsed.isError ? "?" : labelOf(parsed.result) };
});

// Six decimals is about 10 cm on the ground; past that a minute or second turned into degrees only
// shows floating-point noise.
const degrees = (value: number) => `${+Math.abs(value).toFixed(6)}°`;
const latitudeText = (value: number) => `${degrees(value)} ${value < 0 ? "пд. ш." : "пн. ш."}`;
const longitudeText = (value: number) => `${degrees(value)} ${value < 0 ? "зх. д." : "сх. д."}`;

const metres = (value: number) => (value >= 1000 ? `${value / 1000} км` : `${value} м`);

// Grid eastings carry a false 500 000 m on the zone's central meridian; saying how far off it the
// point lies is easier to picture than the raw number.
const fromCentralMeridian = (easting: number) => {
  const offset = easting - 500000;
  return offset === 0
    ? "точно на осьовому меридіані зони"
    : `${metres(Math.abs(offset))} на ${offset < 0 ? "захід" : "схід"} від осьового меридіана зони`;
};

const formatText = {
  WGS84: "Десяткові градуси, широта першою.",
  WGS84R: "Десяткові градуси, довгота першою — порядок переставлено.",
  DD: "Десяткові градуси, півкулю задає літера, а не знак.",
  DDM: "Градуси й десяткові хвилини, зведені до десяткових градусів.",
  DMS: "Градуси, хвилини й секунди, зведені до десяткових градусів.",
};

const Value = ({ children }: { children: ReactNode }) => (
  <b className="font-mono font-normal whitespace-nowrap text-ink">{children}</b>
);

// The parse result in words: what each number means, rather than the raw object.
const describeResult = (
  written:
    | [WGS84Coordinate, "WGS84" | "WGS84R" | "DD" | "DDM" | "DMS"]
    | [MGRSCoordinate]
    | [USNGCoordinate]
    | [UTMCoordinate]
    | [UCS2000Coordinate],
): ReactNode => {
  if (written.length === 2) {
    const [coordinate, format] = written;
    return (
      <>
        {formatText[format]} Широта <Value>{latitudeText(coordinate.latitude)}</Value>, довгота{" "}
        <Value>{longitudeText(coordinate.longitude)}</Value>
      </>
    );
  }
  const result = written[0];
  switch (result.system) {
    // coordinateParser never reports USNG: MGRS reads the same strings and comes first.
    case "MGRS":
      return (
        <>
          Зона <Value>{result.zone}</Value>, смуга широти <Value>{result.band}</Value>, квадрат 100
          км <Value>{result.square}</Value>.{" "}
          {result.precision === 100000 ? (
            <>Цифр немає, тож посилання — увесь квадрат 100 × 100 км.</>
          ) : (
            <>
              Усередині квадрата — <Value>{result.easting} м</Value> на схід і{" "}
              <Value>{result.northing} м</Value> на північ від його південно-західного кута.
              Точність — квадрат <Value>{metres(result.precision)}</Value>.
            </>
          )}
        </>
      );
    case "UTM":
      return (
        <>
          Зона <Value>{result.zone}</Value>
          {result.band && (
            <>
              , смуга широти <Value>{result.band}</Value>
            </>
          )}
          , {result.hemisphere === "N" ? "північна" : "південна"} півкуля. Easting{" "}
          <Value>{result.easting} м</Value> — {fromCentralMeridian(result.easting)}. Northing{" "}
          <Value>{result.northing} м</Value>{" "}
          {result.hemisphere === "N"
            ? "— відстань на північ від екватора."
            : "— відлік на південній півкулі йде від 10 000 км на екваторі."}
        </>
      );
    case "UCS-2000":
      return (
        <>
          Зона <Value>{result.zone}</Value> — перша цифра Y. X <Value>{result.northing} м</Value> —
          відстань на північ від екватора. Y без номера зони <Value>{result.easting} м</Value> —{" "}
          {fromCentralMeridian(result.easting)}.
        </>
      );
  }
};

const PARSE_RESULT_ID = "parse-result";

const CoordinateInput = () => {
  const [text, setText] = useState("");
  const result = coordinateParser.run(text);
  // An empty field has nothing wrong with it yet, so only typed text that fails turns it red.
  const invalid = text !== "" && result.isError;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-1.5 text-sm">
        <span className="opacity-60">Приклади:</span>
        {quickPicks.map(({ input, label }) => (
          <button
            key={input}
            type="button"
            title="Підставити в поле"
            className="group inline-flex cursor-pointer overflow-hidden rounded-full border border-black text-xs"
            onClick={() => setText(input)}
          >
            <span className="bg-black px-2 py-0.5 font-bold text-white">{label}</span>
            <span className="px-2 py-0.5 font-mono group-hover:bg-black/10">{input}</span>
          </button>
        ))}
      </div>
      {/* The field and its verdict stay at the top while the examples scroll by, so a click far
          down the list still shows what went in and how it was read. The paper background,
          stretched over main's padding, hides the cards sliding underneath. */}
      <div className="sticky top-0 z-10 -mx-4 -mt-2 bg-paper px-4 py-2">
        <input
          type="text"
          className={`field w-full ${invalid ? "border-red-600! focus-visible:outline-red-600" : ""}`}
          placeholder="Enter coordinates"
          value={text}
          aria-invalid={invalid}
          aria-describedby={PARSE_RESULT_ID}
          onChange={(e) => setText(e.target.value)}
        />
        {/* A caption under the field, not a panel: the verdict leads, the explanation follows. */}
        <p id={PARSE_RESULT_ID} className="mt-1 text-xs leading-relaxed text-[#7b746a]">
          {text === "" ? (
            "Введіть координати в будь-якому з форматів нижче або оберіть приклад."
          ) : result.isError ? (
            <>
              <span className="text-red-700">Не розпізнано.</span>{" "}
              <span className="font-mono break-words">{result.error}</span>
            </>
          ) : (
            <>
              <span className="text-green-700">Розпізнано як {labelOf(result.result)}.</span>{" "}
              {describeResult(result.result)}
            </>
          )}
        </p>
      </div>

      <h2 className="mt-8 text-lg font-bold tracking-tight">Формати</h2>
      <p className="mt-1 text-sm opacity-60">
        Ви можете вводити координати в наступних форматах. Клік по прикладу підставляє його в поле.
      </p>
      {examples.map(({ system, fullName, description, spec, note, inputs }) => (
        <section key={system} className="card mt-3 p-4 text-sm">
          <h3 className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-base font-bold">{system}</span>
            {spec && (
              <a
                href={spec.href}
                target="_blank"
                rel="noreferrer"
                className="rounded-full border px-2 text-xs hover:border-black"
              >
                {spec.label}
              </a>
            )}
          </h3>
          <p className="mt-0.5 opacity-60">
            {fullName} — {description}
          </p>
          {note && <p className="mt-2 leading-relaxed opacity-60">{note}</p>}
          <ul className="mt-3 flex flex-col gap-1.5">
            {inputs.map(({ input, note }) => (
              <li key={input} className="flex flex-wrap items-baseline gap-x-2">
                <button
                  type="button"
                  className="cursor-pointer rounded-md border bg-paper px-2 py-0.5 font-mono text-xs hover:border-black"
                  onClick={() => setText(input)}
                >
                  {input}
                </button>
                <span className="opacity-60">{note}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
};

type Reference = { href: string; label: string; note: string };

// Read these to understand the systems; the standards below are what the parsers were written
// against. No single document covers all nine formats — they come from four separate traditions,
// and UCS-2000 in particular has no English-language treatment alongside the others.
const reading: Reference[] = [
  {
    href: "https://www.movable-type.co.uk/scripts/latlong-utm-mgrs.html",
    label: "Chris Veness — Latitude/Longitude, UTM & MGRS",
    note: "розбір із геодезією під ним і робочим кодом; найближче до «все в одному»",
  },
  {
    href: "https://github.com/chrisveness/geodesy",
    label: "chrisveness/geodesy",
    note: "той самий код на GitHub, MIT — знадобиться для конвертації в широту й довготу",
  },
  {
    href: "https://www.ordnancesurvey.co.uk/documents/resources/guide-coordinate-systems-great-britain.pdf",
    label: "Ordnance Survey — A Guide to Coordinate Systems in Great Britain",
    note: "еліпсоїди, датуми, проєкції та трансформації — те, що оглядові статті зазвичай пропускають",
  },
];

const sources: Reference[] = [
  {
    href: `${import.meta.env.BASE_URL}NGA_STND_0037_2.0.0_GRIDS.pdf`,
    label: "NGA.STND.0037",
    note: "UTM, UPS і MGRS в одному документі",
  },
  {
    href: "https://www.fgdc.gov/standards/projects/FGDC-standards-projects/usng/fgdc_std_011_2001_usng.pdf",
    label: "FGDC-STD-011-2001",
    note: "USNG",
  },
  {
    href: "https://www.iso.org/standard/75147.html",
    label: "ISO 6709",
    note: "DD, DDM і DMS",
  },
  {
    href: "https://epsg.io/5561",
    label: "EPSG:5561",
    note: "датум УСК-2000; зони Гаусса-Крюгера — EPSG:5562–5565",
  },
  {
    href: "https://sprotyvg7.com.ua/wp-content/uploads/2024/02/topo_red_15_%D1%81%D1%96%D1%87%D0%B5%D0%BD%D1%8C_2023.pdf",
    label: "Довідник з військової топографії (ЗСУ)",
    note: "формат запису прямокутних координат УСК-2000",
  },
  {
    href: "https://www.kmu.gov.ua/npas/9103399",
    label: "Постанова КМУ №1259 від 22.09.2004",
    note: "запровадила УСК-2000 замість СК-42 з 1 січня 2007 року",
  },
];

const ReferenceList = ({ title, items }: { title: string; items: Reference[] }) => (
  <section className="mt-8 text-sm">
    <h2 className="text-lg font-bold tracking-tight">{title}</h2>
    <ul className="mt-2 flex flex-col gap-1.5 leading-relaxed">
      {items.map(({ href, label, note }) => (
        <li key={href}>
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2 hover:no-underline"
          >
            {label}
          </a>
          <span className="opacity-60"> — {note}</span>
        </li>
      ))}
    </ul>
  </section>
);

// Pages live in the URL hash rather than the path: the app is served from GitHub Pages, which has no
// fallback to index.html, so "/coordinate-parser/convert" would 404 on reload while "#/convert" works.
const pages = [
  { hash: "", label: "Парсер" },
  { hash: "#/convert", label: "Конвертер" },
  { hash: "#/guide", label: "Довідник" },
  { hash: "#/api", label: "API" },
] as const;

type PageHash = (typeof pages)[number]["hash"];

const subscribeToHash = (onChange: () => void) => {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
};

const currentPage = (): PageHash =>
  pages.find(({ hash }) => hash !== "" && hash === window.location.hash)?.hash ?? "";

const Navigation = ({ active }: { active: PageHash }) => (
  <nav className="inline-flex rounded-full border bg-white p-0.5 text-sm">
    {pages.map(({ hash, label }) => (
      <a
        key={label}
        href={hash === "" ? "#" : hash}
        aria-current={hash === active ? "page" : undefined}
        className={`rounded-full px-3 py-1 ${
          hash === active ? "bg-ink text-paper" : "opacity-70 hover:opacity-100"
        }`}
      >
        {label}
      </a>
    ))}
  </nav>
);

/** The tabs, the page's title and one line on what it is for. */
const PageHeader = ({
  active,
  title,
  subtitle,
}: {
  active: PageHash;
  title: string;
  subtitle: string;
}) => (
  <header>
    <Navigation active={active} />
    <h1 className="mt-5 text-2xl font-bold tracking-tight">{title}</h1>
    <p className="mt-1 mb-4 text-sm opacity-60">{subtitle}</p>
  </header>
);

const ParserPage = () => (
  <>
    <CoordinateInput />
    <p className="mt-10 text-sm opacity-70">
      Як ці системи влаштовані, чим відрізняються і де на них чекають пастки —{" "}
      <a href="#/guide" className="underline underline-offset-2 hover:no-underline">
        у Довіднику
      </a>
      .
    </p>
  </>
);

// The long read: the article on how the nine notations work, and what to read next.
const GuidePage = () => (
  <>
    <ArticleAboutCoordinateSystems />
    <section className="mt-12">
      <ReferenceList title="Матеріали" items={reading} />
      <ReferenceList title="Першоджерела" items={sources} />
    </section>
  </>
);

function App() {
  const page = useSyncExternalStore(subscribeToHash, currentPage);

  // The converter takes the whole width, the form on the left and the map filling the rest.
  if (page === "#/convert") {
    return (
      <main>
        <Suspense fallback={<p className="p-4 text-sm opacity-60">Завантаження…</p>}>
          <ConverterPage
            header={
              <PageHeader
                active={page}
                title="Конвертер координат"
                subtitle="WGS 84, MGRS / USNG, UTM і УСК-2000 — в обидва боки, з квадратами на карті."
              />
            }
          />
        </Suspense>
      </main>
    );
  }

  // The guide is a long read: on wide screens its contents stay in a column to the left, on narrow
  // ones they fold into a bar at the top. The article keeps the same reading width either way.
  // Equal flexible tracks on both sides keep the article in the middle of the screen, with the
  // contents hugging it from the left; once the left track hits its 14rem minimum, the right one
  // gives way and the article drifts right rather than squeezing the contents.
  if (page === "#/guide") {
    return (
      <main className="m-auto px-4 py-6 lg:grid lg:grid-cols-[minmax(14rem,1fr)_minmax(0,64ch)_minmax(0,1fr)] lg:gap-x-12">
        <aside className="hidden w-56 justify-self-end lg:block">
          <div className="sticky top-6 max-h-[calc(100vh-3rem)] overflow-y-auto">
            <GuideContentsSidebar />
          </div>
        </aside>
        <div className="m-auto min-w-0 max-w-[64ch] lg:m-0">
          <PageHeader
            active={page}
            title="Довідник"
            subtitle="Системи координат, датуми й формати запису: як вони влаштовані й де чекають пастки."
          />
          <GuideContentsBar className="lg:hidden" />
          <GuidePage />
        </div>
      </main>
    );
  }

  // The API reference is laid out like the guide: its contents in a column to the left.
  if (page === "#/api") {
    return (
      <main className="m-auto px-4 py-6 lg:grid lg:grid-cols-[minmax(14rem,1fr)_minmax(0,64ch)_minmax(0,1fr)] lg:gap-x-12">
        <Suspense fallback={<p className="text-sm opacity-60">Завантаження…</p>}>
          <ApiPage
            header={<PageHeader active={page} title="API" subtitle="Типи, парсер і конвертер." />}
          />
        </Suspense>
      </main>
    );
  }

  // The parser is a reading page too: one column, the article's width.
  return (
    <main className="m-auto max-w-[64ch] px-4 py-6">
      <PageHeader
        active={page}
        title="Парсер координат"
        subtitle="Дев'ять способів записати одну точку: вставте будь-який, і парсер скаже, що це."
      />
      <ParserPage />
    </main>
  );
}

export default App;
