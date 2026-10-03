import { type ReactNode, useState } from "react";
import { ConverterMap } from "./ConverterMap.tsx";
import {
  type Area,
  areaOf,
  type Conversion,
  type CoordinateSystem,
  GRID_PRECISION_SYSTEMS,
  GRID_SYSTEMS,
  type GridPrecision,
  LATITUDE_LONGITUDE_NOTATIONS,
  toAllSystems,
  tryFromWGS84,
} from "./converters/coordinateConverter.ts";
import { formatWGS84 } from "./converters/sexagesimalFormat.ts";
import type { Coordinates } from "./parsers/commonParsers.ts";
import { coordinateParser, systemParsers } from "./parsers/coordinateParser.ts";

const AUTO = "auto";
const ALL = "all";

type InputChoice = CoordinateSystem | typeof AUTO;
type OutputChoice = CoordinateSystem | typeof ALL;

// One example per system, all naming roughly the same spot in Kyiv, so switching between them shows
// the conversion settling on the same latitude and longitude every time.
const examples: Record<CoordinateSystem, string> = {
  WGS84: "50.4501, 30.5234",
  WGS84R: "30.5234, 50.4501",
  DD: "50.4501°N, 30.5234°E",
  DDM: "50° 27.006'N, 30° 31.404'E",
  DMS: `50° 27' 0.36"N, 30° 31' 24.24"E`,
  MGRS: "36UUA2418291607",
  USNG: "36U UA 24182 91607",
  UTM: "36U 324182 5591608",
  "UCS-2000": "5593954 6324226",
};

// WGS84, WGS84R, DD, DDM and DMS are one coordinate system written five ways, so they are offered
// as one group, each labelled by how it writes the angle. The grids are systems of their own.
const groups: { label: string; systems: CoordinateSystem[] }[] = [
  { label: "WGS 84 — широта й довгота", systems: LATITUDE_LONGITUDE_NOTATIONS },
  { label: "Прямокутні сітки", systems: GRID_SYSTEMS },
];

const notationLabels: Partial<Record<CoordinateSystem, string>> = {
  WGS84: "десяткові градуси, широта першою",
  WGS84R: "десяткові градуси, довгота першою",
  DD: "десяткові градуси з літерою півкулі",
  DDM: "градуси й десяткові хвилини",
  DMS: "градуси, хвилини й секунди",
};

const optionLabel = (system: CoordinateSystem) =>
  notationLabels[system] === undefined ? system : `${system} — ${notationLabels[system]}`;

/** "WGS 84, запис DD" for a notation, the bare name for a grid. */
const describeSystem = (system: CoordinateSystem) =>
  LATITUDE_LONGITUDE_NOTATIONS.includes(system) ? `WGS 84, запис ${system}` : system;

type Outcome =
  | { kind: "empty" }
  | { kind: "parseError"; message: string }
  | { kind: "conversionError"; system: CoordinateSystem; message: string }
  | { kind: "converted"; system: CoordinateSystem; area: Area };

const parse = (text: string, input: InputChoice) =>
  input === AUTO ? coordinateParser.run(text) : systemParsers[input].run(text);

const convert = (text: string, input: InputChoice): Outcome => {
  if (text.trim() === "") return { kind: "empty" };

  const parsed = parse(text, input);
  if (parsed.isError) return { kind: "parseError", message: parsed.error };

  try {
    return { kind: "converted", system: parsed.result.system, area: areaOf(parsed.result) };
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    return { kind: "conversionError", system: parsed.result.system, message: error.message };
  }
};

const PRECISIONS: GridPrecision[] = [1, 10, 100, 1000, 10000, 100000];

const sizeLabel = (metres: number) => (metres >= 1000 ? `${metres / 1000} км` : `${metres} м`);

const linkStyle = "cursor-pointer underline underline-offset-2 hover:no-underline";

const SystemSelect = <T extends string>({
  label,
  value,
  onChange,
  extra,
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  extra: { value: T; label: string };
}) => (
  <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
    <span className="truncate opacity-60">{label}</span>
    <select
      className="w-full p-2 border rounded-sm bg-transparent"
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
    >
      <option value={extra.value}>{extra.label}</option>
      {groups.map(({ label, systems }) => (
        <optgroup key={label} label={label}>
          {systems.map((system) => (
            <option key={system} value={system}>
              {optionLabel(system)}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  </label>
);

const ConversionValue = ({
  conversion,
  onPick,
}: {
  conversion: Conversion;
  onPick: (conversion: { system: CoordinateSystem; value: string }) => void;
}) =>
  "value" in conversion ? (
    <button
      type="button"
      className={`${linkStyle} text-left font-mono`}
      title="Підставити як вхідне значення"
      onClick={() => onPick(conversion)}
    >
      {conversion.value}
    </button>
  ) : (
    <span className="opacity-60">{conversion.error}</span>
  );

// The corners in the order you would walk round the square, starting from the one the reference
// itself names for MGRS and USNG.
const CORNER_LABELS = [
  ["southWest", "Пд-Зх кут"],
  ["southEast", "Пд-Сх кут"],
  ["northEast", "Пн-Сх кут"],
  ["northWest", "Пн-Зх кут"],
] as const;

const AreaTable = ({ area, caption = "Квадрат" }: { area: Area; caption?: string }) => {
  if (area.corners === null) return <p className="mt-1 opacity-60">Точка — без квадрата.</p>;

  const { corners } = area;
  return (
    <>
      <p className="mt-1 opacity-60">
        {caption} {sizeLabel(area.size)} × {sizeLabel(area.size)}, координати у WGS 84:
      </p>
      <table className="mt-1">
        <tbody>
          {[
            ["Центр", area.centre] as const,
            ...CORNER_LABELS.map(([key, label]) => [label, corners[key]] as const),
          ].map(([label, coords]) => (
            <tr key={label}>
              <th className="py-0.5 pr-3 text-left font-normal whitespace-nowrap opacity-60">
                {label}
              </th>
              <td className="py-0.5 font-mono">{formatWGS84(coords)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
};

const Output = ({
  conversions,
  output,
  onPick,
}: {
  conversions: Conversion[];
  output: OutputChoice;
  onPick: (conversion: { system: CoordinateSystem; value: string }) => void;
}) => {
  if (output !== ALL) {
    const [conversion] = conversions;
    return (
      <div className="mt-4">
        <h3 className="font-bold">{describeSystem(output)}</h3>
        <p className="mt-1 text-base">
          <ConversionValue conversion={conversion} onPick={onPick} />
        </p>
        {"area" in conversion && <AreaTable area={conversion.area} />}
      </div>
    );
  }

  return (
    <>
      <h3 className="mt-4 font-bold">У кожній системі</h3>
      <table className="mt-1 w-full">
        {groups.map(({ label, systems }) => (
          <tbody key={label}>
            <tr>
              <th colSpan={3} className="pt-2 pb-1 text-left">
                {label}
              </th>
            </tr>
            {conversions
              .filter(({ system }) => systems.includes(system))
              .map((conversion) => (
                <tr key={conversion.system} className="align-top">
                  <th className="py-1 pr-3 pl-3 text-left font-normal whitespace-nowrap opacity-60">
                    {conversion.system}
                  </th>
                  <td className="py-1">
                    <ConversionValue conversion={conversion} onPick={onPick} />
                  </td>
                  <td className="py-1 pl-3 text-right whitespace-nowrap opacity-60">
                    {"area" in conversion && conversion.area.corners !== null
                      ? `квадрат ${sizeLabel(conversion.area.size)}`
                      : ""}
                  </td>
                </tr>
              ))}
          </tbody>
        ))}
      </table>
    </>
  );
};

const convertOutput = (coords: Coordinates, output: OutputChoice, precision: GridPrecision) =>
  output === ALL
    ? toAllSystems(coords, { precision })
    : [tryFromWGS84(coords, output, { precision })];

// Each square is drawn once: MGRS and USNG name the same one, and the metre squares of UTM and
// UCS-2000 are indistinguishable from the point at any zoom where the larger ones are visible.
const distinctSquares = (conversions: Conversion[]): Area[] => {
  const seen = new Set<string>();
  return conversions.flatMap((conversion) => {
    if (!("area" in conversion) || conversion.area.corners === null) return [];
    const key = JSON.stringify(conversion.area.corners);
    if (seen.has(key)) return [];
    seen.add(key);
    return [conversion.area];
  });
};

export const ConverterPage = ({ header }: { header: ReactNode }) => {
  const [text, setText] = useState("");
  const [input, setInput] = useState<InputChoice>(AUTO);
  const [output, setOutput] = useState<OutputChoice>(ALL);
  const [precision, setPrecision] = useState<GridPrecision>(1);
  const outcome = convert(text, input);
  const conversions =
    outcome.kind === "converted" ? convertOutput(outcome.area.centre, output, precision) : [];

  // A converted value is fed back in under its own system rather than through auto-detection:
  // auto-detection would read a WGS84R pair as WGS84 and a USNG reference as MGRS.
  const pick = ({ system, value }: { system: CoordinateSystem; value: string }) => {
    setText(value);
    setInput(system);
  };

  // Swapping turns the current result into the next input, so the direction of the conversion
  // flips without retyping anything.
  const swap = () => {
    if (outcome.kind === "converted" && output !== ALL) {
      const conversion = tryFromWGS84(outcome.area.centre, output, { precision });
      if ("value" in conversion) setText(conversion.value);
    }
    setInput(output === ALL ? AUTO : output);
    setOutput(input === AUTO ? ALL : input);
  };

  return (
    <div className="lg:grid lg:h-screen lg:grid-cols-[minmax(0,60ch)_1fr]">
      <div className="p-4 lg:overflow-y-auto">
        {header}
        <div className="flex items-end gap-2">
          <SystemSelect
            label="Вводимо в системі"
            value={input}
            onChange={setInput}
            extra={{ value: AUTO, label: "Визначити автоматично" }}
          />
          <button
            type="button"
            className="p-2 border rounded-sm cursor-pointer text-sm"
            title="Поміняти системи місцями"
            onClick={swap}
          >
            ⇄
          </button>
          <SystemSelect
            label="Відображаємо в системі"
            value={output}
            onChange={setOutput}
            extra={{ value: ALL, label: "Усі системи" }}
          />
        </div>

        {(output === ALL || GRID_PRECISION_SYSTEMS.includes(output)) && (
          <label className="mt-2 flex items-center gap-2 text-sm">
            <span className="opacity-60">Точність MGRS і USNG</span>
            <select
              className="p-1 border rounded-sm bg-transparent"
              value={precision}
              onChange={(e) => setPrecision(Number(e.target.value) as GridPrecision)}
            >
              {PRECISIONS.map((metres) => (
                <option key={metres} value={metres}>
                  {sizeLabel(metres)}
                </option>
              ))}
            </select>
          </label>
        )}

        <input
          type="text"
          className="mt-3 p-2 w-full border rounded-sm"
          placeholder={input === AUTO ? "Enter coordinates" : examples[input]}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />

        <div className="mt-4 text-sm">
          {outcome.kind === "empty" && (
            <p className="opacity-60">
              {input === AUTO
                ? "Введіть координати в будь-якому підтримуваному форматі."
                : `Введіть координати в системі ${describeSystem(input)}, наприклад ${examples[input]}`}
            </p>
          )}
          {outcome.kind === "parseError" && (
            <p className="font-mono text-red-700">{outcome.message}</p>
          )}
          {outcome.kind === "conversionError" && (
            <p>
              Розпізнано як <b>{describeSystem(outcome.system)}</b>, але перетворити не вдалося:{" "}
              <span className="font-mono text-red-700">{outcome.message}</span>
            </p>
          )}
          {outcome.kind === "converted" && (
            <>
              {input === AUTO && (
                <p>
                  Розпізнано як <b>{describeSystem(outcome.system)}</b>
                </p>
              )}

              <Output conversions={conversions} output={output} onPick={pick} />

              {outcome.area.corners !== null && (
                <div className="mt-4">
                  <AreaTable area={outcome.area} caption="Вхідне значення — квадрат" />
                </div>
              )}
              <a
                href={`https://www.openstreetmap.org/?mlat=${outcome.area.centre.latitude}&mlon=${outcome.area.centre.longitude}#map=15/${outcome.area.centre.latitude}/${outcome.area.centre.longitude}`}
                target="_blank"
                rel="noreferrer"
                className={`${linkStyle} mt-4 inline-block`}
              >
                показати на карті
              </a>
            </>
          )}
        </div>

        <section className="mt-6 text-sm">
          <h3 className="font-bold">Приклади</h3>
          {groups.map(({ label, systems }) => (
            <div key={label} className="mt-2">
              <h4 className="opacity-60">{label}</h4>
              <ul className="mt-1 flex flex-col gap-1">
                {systems.map((system) => (
                  <li key={system}>
                    <span className="inline-block w-20 opacity-60">{system}</span>
                    <button
                      type="button"
                      className={`${linkStyle} font-mono`}
                      onClick={() => pick({ system, value: examples[system] })}
                    >
                      {examples[system]}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>

        <section className="mt-6 text-sm opacity-60">
          <p>
            Усе перетворюється через WGS 84: вхідні координати спершу зводяться до широти й довготи,
            а з них пораховано решту систем. UTM, MGRS і USNG — поперечна проєкція Меркатора на тому
            ж еліпсоїді WGS 84. УСК-2000 стоїть на іншому датумі, тому перед проєкцією
            Гаусса-Крюгера точку зсунуто на еліпсоїд Красовського за параметрами EPSG:5840 (точність
            близько 1 м).
          </p>
          <p className="mt-2">
            Сітки називають квадрат, а не точку. MGRS і USNG — квадрат обраної точності, від 1 м до
            100 км, кут якого записаний у самому посиланні. UTM і УСК-2000 записані до метра, тож
            позначають квадрат 1 м навколо значення. Для кожного квадрата видно центр і чотири кути
            у WGS 84. Кути взято по сітці, тому далеко від осьового меридіана квадрат трохи
            повернутий відносно паралелей і меридіанів. У базу зберігається центр.
          </p>
        </section>
      </div>

      <div className="h-[60vh] lg:h-full">
        <ConverterMap
          centre={outcome.kind === "converted" ? outcome.area.centre : null}
          inputArea={outcome.kind === "converted" ? outcome.area : null}
          outputAreas={distinctSquares(conversions)}
        />
      </div>
    </div>
  );
};
