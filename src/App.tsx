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
    description: "широта, потім довгота",
    inputs: [
      { input: "50.4501, 30.5234", note: "через кому" },
      { input: "50.4501 30.5234", note: "через пробіл" },
      { input: "50,4501 30,5234", note: "кома як десятковий знак, роздільник лише пробіл" },
    ],
  },
  {
    system: "WGS84R",
    description: "довгота, потім широта",
    inputs: [
      { input: "151.2093, -33.8688", note: "через кому" },
      { input: "151,2093 -33,8688", note: "кома як десятковий знак, роздільник лише пробіл" },
    ],
  },
  {
    system: "MGRS",
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
    system: "UCS-2000",
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
      <p className="mt-3 text-sm">Ви можете вводити координати в наступних форматах:</p>
      {examples.map(({ system, description, spec, note, inputs }) => (
        <section key={system} className="mt-2 text-sm">
          <h3>
            <span className="font-bold">{system}</span>
            <span className="opacity-60"> — {description}</span>
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
      <div className="mt-4 whitespace-pre-wrap text-sm font-mono">
        {JSON.stringify(result, null, 2)}
      </div>
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
