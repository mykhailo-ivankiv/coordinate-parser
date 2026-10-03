import { useState } from "react";
import { type Conversion, toAllSystems, toWGS84 } from "./converters/coordinateConverter.ts";
import { coordinateParser } from "./parsers/coordinateParser.ts";

// One example per system, all naming roughly the same spot in Kyiv, so switching between them shows
// the conversion settling on the same latitude and longitude every time.
const examples = [
  "50.4501, 30.5234",
  "50.4501°N, 30.5234°E",
  "50° 27.006'N, 30° 31.404'E",
  `50° 27' 0.36"N, 30° 31' 24.24"E`,
  "36U 324182 5591608",
  "36UUA2418291607",
  "36U UA 24182 91607",
  "5593954 6324226",
];

type Outcome =
  | { kind: "empty" }
  | { kind: "parseError"; message: string }
  | { kind: "conversionError"; system: string; message: string }
  | {
      kind: "converted";
      system: string;
      coords: { latitude: number; longitude: number };
      conversions: Conversion[];
    };

const convert = (text: string): Outcome => {
  if (text.trim() === "") return { kind: "empty" };

  const parsed = coordinateParser.run(text);
  if (parsed.isError) return { kind: "parseError", message: parsed.error };

  try {
    const coords = toWGS84(parsed.result);
    return {
      kind: "converted",
      system: parsed.result.system,
      coords,
      conversions: toAllSystems(coords),
    };
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    return { kind: "conversionError", system: parsed.result.system, message: error.message };
  }
};

const Result = ({ outcome, onPick }: { outcome: Outcome; onPick: (value: string) => void }) => {
  switch (outcome.kind) {
    case "empty":
      return (
        <p className="mt-4 text-sm opacity-60">
          Введіть координати в будь-якому підтримуваному форматі.
        </p>
      );
    case "parseError":
      return <p className="mt-4 text-sm font-mono text-red-700">{outcome.message}</p>;
    case "conversionError":
      return (
        <p className="mt-4 text-sm">
          Розпізнано як <b>{outcome.system}</b>, але перетворити не вдалося:{" "}
          <span className="font-mono text-red-700">{outcome.message}</span>
        </p>
      );
    case "converted": {
      const { system, coords, conversions } = outcome;
      return (
        <div className="mt-4 text-sm">
          <p>
            Розпізнано як <b>{system}</b>
          </p>

          <h3 className="mt-3 font-bold">WGS 84 — так зберігається в базі</h3>
          <pre className="mt-1 font-mono">{JSON.stringify(coords, null, 2)}</pre>
          <a
            href={`https://www.openstreetmap.org/?mlat=${coords.latitude}&mlon=${coords.longitude}#map=15/${coords.latitude}/${coords.longitude}`}
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2 hover:no-underline"
          >
            показати на карті
          </a>

          <h3 className="mt-4 font-bold">У кожній системі</h3>
          <table className="mt-1 w-full">
            <tbody>
              {conversions.map((conversion) => (
                <tr key={conversion.system} className="align-top">
                  <th className="py-1 pr-3 text-left font-normal whitespace-nowrap opacity-60">
                    {conversion.system}
                  </th>
                  <td className="py-1">
                    {"value" in conversion ? (
                      <button
                        type="button"
                        className="cursor-pointer text-left font-mono underline underline-offset-2 hover:no-underline"
                        onClick={() => onPick(conversion.value)}
                      >
                        {conversion.value}
                      </button>
                    ) : (
                      <span className="opacity-60">{conversion.error}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
  }
};

export const ConverterPage = () => {
  const [text, setText] = useState("");
  const outcome = convert(text);

  return (
    <div>
      <input
        type="text"
        className="p-2 w-full border rounded-sm"
        placeholder="Enter coordinates"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />

      <Result outcome={outcome} onPick={setText} />

      <section className="mt-6 text-sm">
        <h3 className="font-bold">Приклади</h3>
        <ul className="mt-1 flex flex-col gap-1">
          {examples.map((example) => (
            <li key={example}>
              <button
                type="button"
                className="cursor-pointer font-mono underline underline-offset-2 hover:no-underline"
                onClick={() => setText(example)}
              >
                {example}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-6 text-sm opacity-60">
        <p>
          Усе перетворюється через WGS 84: вхідні координати спершу зводяться до широти й довготи, а
          з них пораховано решту систем. UTM, MGRS і USNG — поперечна проєкція Меркатора на тому ж
          еліпсоїді WGS 84. УСК-2000 стоїть на іншому датумі, тому перед проєкцією Гаусса-Крюгера
          точку зсунуто на еліпсоїд Красовського за параметрами EPSG:5840 (точність близько 1 м).
        </p>
        <p className="mt-2">
          MGRS і USNG називають квадрат, а не точку: у зворотний бік повертається центр квадрата, а
          в прямий — квадрат, що містить точку, з точністю 1 м.
        </p>
      </section>
    </div>
  );
};
