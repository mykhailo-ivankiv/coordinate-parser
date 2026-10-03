import { type ReactNode, useEffect, useState } from "react";
import { ConverterMap, type OutputSquare, OUTPUT_COLOUR, type MapLayers } from "./ConverterMap.tsx";
import {
  type Area,
  areaOf,
  type Conversion,
  type Coordinates,
  type Coverage,
  coveringSquares,
  fromWGS84,
  type GridPrecision,
  insideUcs2000AreaOfUse,
  type Notation,
  tryFromWGS84,
} from "@coordinate-parser/converter";
import { formatWGS84 } from "@coordinate-parser/formatter";
import {
  coordinateParser,
  mgrsParser,
  ucs2000Parser,
  usngParser,
  utmParser,
  wgs84ddmParser,
  wgs84ddParser,
  wgs84dmsParser,
  wgs84Parser,
} from "@coordinate-parser/parser";
import type {
  CoordinateSystem,
  MGRSCoordinate,
  UCS2000Coordinate,
  USNGCoordinate,
  UTMCoordinate,
  WGS84Coordinate,
} from "@coordinate-parser/types";
import { choice } from "arcsecond";
import { labelOf, systemLabel } from "./labels.ts";

const AUTO = "auto";

type InputChoice = CoordinateSystem | typeof AUTO;

// One example per system, all naming roughly the same spot in Kyiv, so switching between them shows
// the conversion settling on the same latitude and longitude every time.
const examples: Record<CoordinateSystem, string> = {
  WGS84: "50.4501, 30.5234",
  MGRS: "36UUA2418291607",
  USNG: "36U UA 24182 91607",
  UTM: "36U 324182 5591608",
  "UCS-2000": "5593954 6324226",
};

// The rectangular grids, each a system with a projection of its own.
const GRID_SYSTEMS: CoordinateSystem[] = ["MGRS", "USNG", "UTM", "UCS-2000"];

// WGS 84 is one system written several ways, offered once; the grids are systems of their own.
const groups: { label: string; systems: CoordinateSystem[] }[] = [
  { label: "WGS 84 — широта й довгота", systems: ["WGS84"] },
  { label: "Прямокутні сітки", systems: GRID_SYSTEMS },
];

// The examples: WGS 84 as the plain signed pair, plus the grids. Its other formats are still read.
const EXAMPLE_SYSTEMS: CoordinateSystem[] = ["WGS84", ...GRID_SYSTEMS];

// WGS 84 is offered once, and reads every latitude-first notation of it; see `parsers` below.
const notationLabels: Partial<Record<CoordinateSystem, string>> = {
  WGS84: "десяткові, DD, DDM або DMS, широта першою",
};

const optionLabel = (system: CoordinateSystem) =>
  notationLabels[system] === undefined ? system : `${system} — ${notationLabels[system]}`;

type Outcome =
  | { kind: "empty" }
  | { kind: "parseError"; message: string }
  | {
      kind: "conversionError";
      written:
        | [WGS84Coordinate, "WGS84" | "WGS84R" | "DD" | "DDM" | "DMS"]
        | [MGRSCoordinate]
        | [USNGCoordinate]
        | [UTMCoordinate]
        | [UCS2000Coordinate];
      message: string;
    }
  | {
      kind: "converted";
      written:
        | [WGS84Coordinate, "WGS84" | "WGS84R" | "DD" | "DDM" | "DMS"]
        | [MGRSCoordinate]
        | [USNGCoordinate]
        | [UTMCoordinate]
        | [UCS2000Coordinate];
      area: Area;
    };

// The parser behind each choice in the system select. WGS 84 reads every latitude-first notation,
// since the select offers it once for all of them; WGS84R is left out, as a longitude-first pair is
// far likelier a mistake there than a choice.
const parsers = {
  [AUTO]: coordinateParser,
  WGS84: choice([wgs84Parser, wgs84ddParser, wgs84ddmParser, wgs84dmsParser]),
  MGRS: mgrsParser,
  USNG: usngParser,
  UTM: utmParser,
  "UCS-2000": ucs2000Parser,
} satisfies Record<InputChoice, unknown>;

const parse = (text: string, input: InputChoice) => parsers[input].run(text);

const convert = (text: string, input: InputChoice): Outcome => {
  if (text.trim() === "") return { kind: "empty" };

  const parsed = parse(text, input);
  if (parsed.isError) return { kind: "parseError", message: parsed.error };

  try {
    return { kind: "converted", written: parsed.result, area: areaOf(parsed.result[0]) };
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    return { kind: "conversionError", written: parsed.result, message: error.message };
  }
};

const PRECISIONS: GridPrecision[] = [1, 10, 100, 1000, 10000, 100000];

const sizeLabel = (metres: number) => (metres >= 1000 ? `${metres / 1000} км` : `${metres} м`);

const linkStyle = "cursor-pointer underline underline-offset-2 hover:no-underline";

const SYSTEM_SELECT_ID = "converter-system";
const COORDINATES_INPUT_ID = "converter-coordinates";
const COORDINATES_ERROR_ID = "converter-coordinates-error";

const FieldLabel = ({ htmlFor, children }: { htmlFor: string; children: ReactNode }) => (
  <label htmlFor={htmlFor} className="text-xs opacity-60">
    {children}
  </label>
);

const SystemSelect = ({
  value,
  onChange,
}: {
  value: InputChoice;
  onChange: (value: InputChoice) => void;
}) => (
  <select
    id={SYSTEM_SELECT_ID}
    className="field w-full truncate text-sm"
    value={value}
    onChange={(e) => onChange(e.target.value as InputChoice)}
  >
    <option value={AUTO}>Визначити автоматично</option>
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
);

const ConversionValue = ({ conversion, onPick }: { conversion: Conversion; onPick: Pick }) =>
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

// The diagram's drawing space, in SVG units: the square is fitted into SQUARE_SIZE around the middle,
// leaving room outside its corners for their coordinates.
const DIAGRAM_WIDTH = 360;
const DIAGRAM_HEIGHT = 250;
const DIAGRAM_MIDDLE = { x: DIAGRAM_WIDTH / 2, y: DIAGRAM_HEIGHT / 2 };
const SQUARE_SIZE = 150;

// Each corner's label set diagonally off it, away from the square: `dx` and `dy` in SVG units.
const CORNER_LABELS = [
  { corner: "northWest", dx: -6, dy: -22, anchor: "end" },
  { corner: "northEast", dx: 6, dy: -22, anchor: "start" },
  { corner: "southWest", dx: -6, dy: 16, anchor: "end" },
  { corner: "southEast", dx: 6, dy: 16, anchor: "start" },
] as const;

/** Puts a value into the input, with the system it is written in. */
type Pick = (conversion: { system: Notation; value: string }) => void;

// Values on the page are written in a notation; the system select offers systems, WGS 84 once.
const systemOf = (notation: Notation): CoordinateSystem => {
  switch (notation) {
    case "WGS84":
    case "WGS84R":
    case "DD":
    case "DDM":
    case "DMS":
      return "WGS84";
    default:
      return notation;
  }
};

/**
 * A coordinate as two SVG text lines, latitude over longitude, anchored at (x, y). Clicking it, or
 * Enter or Space on it, puts the point into the input as WGS 84, like every other value on the page.
 */
const CoordinateLabel = ({
  coords,
  x,
  y,
  anchor,
  onPick,
}: {
  coords: Coordinates;
  x: number;
  y: number;
  anchor: "start" | "middle" | "end";
  onPick: Pick;
}) => {
  const value = formatWGS84({ ...coords, system: "WGS84" });
  const [latitude, longitude] = value.split(", ");
  const pick = () => onPick({ system: "WGS84", value });
  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={`Підставити ${value} як вхідне значення`}
      className="cursor-pointer hover:opacity-70 focus:outline-none focus-visible:opacity-70"
      onClick={pick}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        pick();
      }}
    >
      <title>Підставити як вхідне значення</title>
      <text
        x={x}
        y={y}
        textAnchor={anchor}
        className="fill-current font-mono underline underline-offset-2"
        fontSize={11}
      >
        <tspan x={x}>{latitude}</tspan>
        <tspan x={x} dy={13}>
          {longitude}
        </tspan>
      </text>
    </g>
  );
};

/**
 * The square a converted value names, drawn to scale from its outline: north up as on the map, so a
 * square away from its central meridian sits a little turned, and the edges of a large one bow. Each
 * corner's WGS 84 coordinates are set diagonally off that corner, the centre's in the middle. In the
 * same red as the result squares on the map, so the two read as one thing.
 */
const AreaDiagram = ({ area, onPick }: { area: Area; onPick: Pick }) => {
  const { corners, outline, centre, size } = area;
  if (corners === null || outline === null) {
    return <p className="mt-1 opacity-60">Точка — без квадрата.</p>;
  }

  // A local flat view around the centre: east to the right, north up, a degree of longitude
  // shortened by the cosine of the latitude so that the square keeps its shape.
  const shrink = Math.cos((centre.latitude * Math.PI) / 180);
  const local = ({ latitude, longitude }: Coordinates) => ({
    x: (((((longitude - centre.longitude) % 360) + 540) % 360) - 180) * shrink,
    y: latitude - centre.latitude,
  });
  const ring = outline.map(local);
  const extent = Math.max(...ring.map(({ x, y }) => Math.max(Math.abs(x), Math.abs(y))));
  const scale = SQUARE_SIZE / 2 / extent;
  const toSvg = (coords: Coordinates) => {
    const { x, y } = local(coords);
    return { x: DIAGRAM_MIDDLE.x + x * scale, y: DIAGRAM_MIDDLE.y - y * scale };
  };

  return (
    <figure className="mt-2">
      <svg
        viewBox={`0 0 ${DIAGRAM_WIDTH} ${DIAGRAM_HEIGHT}`}
        className="w-full max-w-sm"
        role="img"
        aria-label={`Квадрат ${sizeLabel(size)} × ${sizeLabel(size)}, центр ${formatWGS84({ ...centre, system: "WGS84" })}`}
      >
        <path
          d={`${outline
            .map(toSvg)
            .map(({ x, y }, index) => `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`)
            .join(" ")} Z`}
          fill={OUTPUT_COLOUR}
          fillOpacity={0.15}
          stroke={OUTPUT_COLOUR}
          strokeWidth={2}
        />
        {CORNER_LABELS.map(({ corner, dx, dy, anchor }) => {
          const at = toSvg(corners[corner]);
          return (
            <g key={corner}>
              <circle cx={at.x} cy={at.y} r={4} fill={OUTPUT_COLOUR} />
              <CoordinateLabel
                coords={corners[corner]}
                x={at.x + dx}
                y={at.y + dy}
                anchor={anchor}
                onPick={onPick}
              />
            </g>
          );
        })}

        <text
          x={DIAGRAM_MIDDLE.x}
          y={DIAGRAM_MIDDLE.y - 14}
          textAnchor="middle"
          className="fill-current"
          fontSize={11}
          opacity={0.6}
        >
          {sizeLabel(size)} × {sizeLabel(size)}
        </text>
        <circle cx={DIAGRAM_MIDDLE.x} cy={DIAGRAM_MIDDLE.y} r={4} fill={OUTPUT_COLOUR} />
        <CoordinateLabel
          coords={centre}
          x={DIAGRAM_MIDDLE.x}
          y={DIAGRAM_MIDDLE.y + 20}
          anchor="middle"
          onPick={onPick}
        />
        <text
          x={DIAGRAM_MIDDLE.x}
          y={DIAGRAM_MIDDLE.y + 48}
          textAnchor="middle"
          className="fill-current"
          fontSize={11}
          opacity={0.6}
        >
          центр
        </text>
      </svg>
      <figcaption className="text-xs opacity-60">
        Кути й центр квадрата у WGS 84; північ угорі, форма й поворот — у масштабі.
      </figcaption>
    </figure>
  );
};

// Ukrainian agrees the noun with the number: 1 квадрат, 2 квадрати, 5 квадратів, 21 квадрат.
const squaresWord = (count: number) => {
  const lastTwo = count % 100;
  const last = count % 10;
  if (last === 1 && lastTwo !== 11) return "квадрат";
  if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) return "квадрати";
  return "квадратів";
};

const CoverageList = ({
  coverage,
  system,
  onPick,
}: {
  coverage: Coverage | null;
  system: Notation;
  onPick: Pick;
}) => {
  if (coverage?.kind === "tooMany") {
    return (
      <p className="mt-3 opacity-60">
        Вхідна зона охоплює близько {coverage.count.toLocaleString("uk-UA")}{" "}
        {squaresWord(coverage.count)} {system} — забагато, щоб перелічити (межа — {coverage.limit}).
        Оберіть грубішу точність.
      </p>
    );
  }
  if (coverage === null || coverage.squares.length < 2) return null;

  return (
    <div className="mt-3">
      <p>
        Вхідна зона перетинає {coverage.squares.length} {squaresWord(coverage.squares.length)}{" "}
        {system}: точка може бути в будь-якому з них. Перший містить центр — його й повертає
        конвертація.
      </p>
      <ul className="mt-1 flex flex-col gap-0.5">
        {coverage.squares.map((square, index) => (
          <li key={square.value}>
            <ConversionValue conversion={square} onPick={onPick} />
            {index === 0 && <span className="opacity-60"> — містить центр</span>}
          </li>
        ))}
      </ul>
    </div>
  );
};

// The results, one section per coordinate system. MGRS and USNG share a section: USNG adopts the
// MGRS grid unchanged, so at a given precision both name the same square and differ only in how it
// is written. Splitting them would show one square twice, with two precision controls to keep in step.
type SectionId = "WGS84" | "MGRS" | "UTM" | "UCS-2000";

type Section = {
  id: SectionId;
  title: string;
  /** The systems the section writes the point in; the first one names the squares. */
  systems: Notation[];
  /** Whether the section's squares come in a choice of sizes. */
  hasPrecision: boolean;
};

const sections: Section[] = [
  { id: "WGS84", title: "WGS 84", systems: ["WGS84"], hasPrecision: false },
  { id: "MGRS", title: "MGRS / USNG", systems: ["MGRS", "USNG"], hasPrecision: true },
  { id: "UTM", title: "UTM", systems: ["UTM"], hasPrecision: false },
  { id: "UCS-2000", title: "УСК-2000", systems: ["UCS-2000"], hasPrecision: false },
];

type SectionResult = {
  conversions: Conversion[];
  /** The squares the input zone reaches; null for the point notation, or when nothing converts. */
  coverage: Coverage | null;
};

const coverageOf = (area: Area, system: Notation, precision: GridPrecision) => {
  try {
    return coveringSquares(area, system, { precision });
  } catch (error) {
    // The system cannot express the input at all; the section already shows why.
    if (error instanceof RangeError) return null;
    throw error;
  }
};

const resultOf = (section: Section, area: Area, precision: GridPrecision): SectionResult => ({
  conversions: section.systems.map((system) => tryFromWGS84(area.centre, system, { precision })),
  coverage: section.id === "WGS84" ? null : coverageOf(area, section.systems[0], precision),
});

const squaresForMap = (coverage: Coverage | null): OutputSquare[] => {
  if (coverage === null) return [];
  if (coverage.kind === "tooMany") return [{ area: coverage.primary.area, primary: true }];

  // Labels only when there is more than one square to tell apart.
  const labelled = coverage.squares.length > 1;
  return coverage.squares.map(({ area, value }, index) => ({
    area,
    label: labelled ? value : undefined,
    primary: index === 0,
  }));
};

const PrecisionRange = ({
  value,
  onChange,
}: {
  value: GridPrecision;
  onChange: (value: GridPrecision) => void;
}) => (
  <label className="flex items-center gap-2">
    <span className="opacity-60">Точність</span>
    <input
      type="range"
      className="flex-1"
      min={0}
      max={PRECISIONS.length - 1}
      step={1}
      value={PRECISIONS.indexOf(value)}
      onChange={(e) => onChange(PRECISIONS[Number(e.target.value)])}
    />
    <span className="w-14 text-right font-mono">{sizeLabel(value)}</span>
  </label>
);

const Accordion = ({
  title,
  summary,
  open,
  onToggle,
  shown,
  onShow,
  children,
}: {
  title: string;
  summary: ReactNode;
  open: boolean;
  onToggle: () => void;
  shown: boolean;
  onShow: (shown: boolean) => void;
  children: ReactNode;
}) => (
  <section className="card px-3 py-2.5">
    <div className="flex items-center gap-2">
      {/* The checkbox sits beside the toggle rather than inside it, so ticking it never folds the section. */}
      <button
        type="button"
        aria-expanded={open}
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left"
        onClick={onToggle}
      >
        <span
          className={`inline-block w-3 text-xs opacity-50 transition-transform ${open ? "rotate-90" : ""}`}
        >
          ▶
        </span>
        <span className="font-bold whitespace-nowrap">{title}</span>
        {!open && <span className="truncate font-mono opacity-60">{summary}</span>}
      </button>
      <label className="flex cursor-pointer items-center gap-1 whitespace-nowrap text-xs">
        <input type="checkbox" checked={shown} onChange={(e) => onShow(e.target.checked)} />
        на карті
      </label>
    </div>
    {open && <div className="mt-3 border-t border-line pt-3 pl-5">{children}</div>}
  </section>
);

const summaryOf = (result: SectionResult | null) => {
  const first = result?.conversions[0];
  if (first === undefined) return "—";
  if (!("value" in first)) return "не перетворюється";
  return first.outsideAreaOfUse ? `⚠️ ${first.value}` : first.value;
};

const WARNING_STYLE = "text-amber-700";

/** Shown wherever a UCS-2000 value lies outside Ukraine, the system's area of use. */
const OutsideAreaOfUse = () => (
  <p className={`mt-1 ${WARNING_STYLE}`}>
    ⚠️ Поза зоною визначення УСК-2000: зсув датуму EPSG:5840 підібрано для України, тож точність тут
    не гарантована.
  </p>
);

const SectionBody = ({
  section,
  result,
  precision,
  onPrecision,
  onPick,
}: {
  section: Section;
  result: SectionResult | null;
  precision: GridPrecision;
  onPrecision: (precision: GridPrecision) => void;
  onPick: Pick;
}) => (
  <>
    {section.hasPrecision && <PrecisionRange value={precision} onChange={onPrecision} />}

    {result === null ? (
      <p className="mt-1 opacity-60">Введіть координати, щоб побачити значення.</p>
    ) : (
      <>
        <table className={section.hasPrecision ? "mt-2" : ""}>
          <tbody>
            {result.conversions.map((conversion) => (
              <tr key={conversion.system} className="align-top">
                {result.conversions.length > 1 && (
                  <th className="py-0.5 pr-3 text-left font-normal opacity-60">
                    {conversion.system}
                  </th>
                )}
                <td className="py-0.5 text-base">
                  <ConversionValue conversion={conversion} onPick={onPick} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {result.conversions.some(
          (conversion) => "value" in conversion && conversion.outsideAreaOfUse,
        ) && <OutsideAreaOfUse />}

        {section.id === "WGS84" ? (
          <p className="mt-1 opacity-60">Так точка зберігається в базі.</p>
        ) : (
          "area" in result.conversions[0] && (
            <AreaDiagram area={result.conversions[0].area} onPick={onPick} />
          )
        )}

        <CoverageList coverage={result.coverage} system={section.systems[0]} onPick={onPick} />
      </>
    )}
  </>
);

const ExternalLink = ({ href, children }: { href: string; children: ReactNode }) => (
  <a href={href} target="_blank" rel="noreferrer" className={linkStyle}>
    {children}
  </a>
);

// What this converter needs, against what a general projection engine carries.
const SCOPE_ROWS = [
  ["Еліпсоїди", "2 — WGS 84 і Красовського"],
  ["Методи проєкції", "1 — поперечний Меркатор; UTM і Гаусс-Крюгер різняться лише параметрами"],
  ["Трансформації датумів", "1 — EPSG:5840, три зсуви"],
  ["Нотації", "DD, DDM, DMS, MGRS / USNG, UTM, УСК-2000"],
];

const WasmAnswer = () => (
  <>
    <p>
      Конвертери на базі ArcGIS Maps SDK for JavaScript під час роботи завантажують з js.arcgis.com
      файл <code className="font-mono">pe-wasm.wasm</code> — близько 2,7 МБ. Це не окремий
      конвертер, а Esri Projection Engine: бібліотека на C/C++, яка роками працює всередині ArcGIS
      Pro, ArcGIS Server і мобільних SDK. Для вебу Esri її не переписувала, а скомпілювала у
      WebAssembly. Так перевірений нативний код потрапляє в браузер, і всі продукти Esri рахують
      однаково, до останнього знака.
    </p>
    <p className="mt-2">Основну вагу дають не формули, а дані й загальність:</p>
    <ul className="mt-1 flex list-disc flex-col gap-1 pl-5">
      <li>
        тисячі систем координат — уся база EPSG і власні ідентифікатори Esri, кожна з еліпсоїдом,
        датумом, проєкцією й одиницями, вкомпільованими в модуль;
      </li>
      <li>сотні методів проєкції — Меркатор, Ламберт, Альберс, полярні, псевдоциліндричні;</li>
      <li>
        тисячі трансформацій датумів — параметричні (Гельмерта, Молоденського) і сіткові (NTv2,
        NADCON), а також вертикальні датуми;
      </li>
      <li>розбір і форматування нотацій на кшталт MGRS, UTM чи DMS.</li>
    </ul>
    <p className="mt-2">Цьому конвертеру потрібен мізерний зріз цієї загальності:</p>
    <table className="mt-1">
      <tbody>
        {SCOPE_ROWS.map(([what, here]) => (
          <tr key={what} className="align-top">
            <th className="py-0.5 pr-3 text-left font-normal whitespace-nowrap">{what}</th>
            <td className="py-0.5">{here}</td>
          </tr>
        ))}
      </tbody>
    </table>
    <p className="mt-2">
      Поперечний Меркатор у формулюванні{" "}
      <ExternalLink href="https://arxiv.org/abs/1002.1417">Карні</ExternalLink> — близько ста
      рядків: два набори по шість коефіцієнтів і кілька формул. Зсув датуму — переведення в
      декартові координати, додавання вектора й переведення назад. Сітка MGRS — арифметика з
      літерами. Решта коду — парсери, форматування й коментарі.
    </p>
    <p className="mt-2">
      Точність від цього не страждає. Ряд Карні шостого порядку — той самий, що в{" "}
      <ExternalLink href="https://proj.org/">PROJ</ExternalLink>, і він дає нанометрову точність у
      межах зони. Результати цього конвертера збігаються з PROJ до міліметра.
    </p>
    <p className="mt-2">
      Компактність — наслідок вузького охоплення: для систем, які тут підтримуються, загальний рушій
      — це мегабайти коду, що ніколи не виконується.
    </p>
  </>
);

const Pipeline = ({ children }: { children: ReactNode }) => (
  <pre className="mt-1 overflow-x-auto font-mono whitespace-pre">{children}</pre>
);

// Why a few hundred lines of our own rather than a library, argued against the obvious candidates.
const ADVANTAGES: [string, ReactNode][] = [
  [
    "Нічого зайвого",
    "Жодної залежності, жодного WebAssembly, жодного завантаження з CDN під час роботи. Конвертер працює офлайн, з першого кадру, і не додає до сторінки мегабайтів, з яких виконується дещиця.",
  ],
  [
    "Датум обрано свідомо",
    "УСК-2000 ↔ WGS 84 — це EPSG:5840, точність 1 м, та сама трансформація, яку обирає PROJ. У proj4js параметри зсуву треба знати й вписати самому, і помилка з ними дає правдоподібний результат, що промахується на метри.",
  ],
  [
    "Те, чого бібліотеки не роблять",
    "PROJ і proj4js не читають і не пишуть MGRS чи USNG і не знають про українські формати запису. Тут є парсери, квадрати MGRS з кутами, перевірка смуги широти, пошук усіх квадратів, у які сягає вхідна зона, і зрозумілі повідомлення про помилки.",
  ],
  [
    "Перевірено проти еталона",
    "Під час розробки еталоном був PROJ 9.3: значення UTM, УСК-2000 і кути квадратів у тестах узяті з нього, і результати збігаються до міліметра. Окремий тест обходить усю земну кулю з кроком 100 км.",
  ],
  [
    "Код можна прочитати",
    "Кілька сотень рядків із посиланнями на першоджерела — стандарти NGA, FGDC, ISO, реєстр EPSG і статтю Карні. Кожне рішення пояснене поруч із кодом.",
  ],
];

const ProjAnswer = () => (
  <>
    <p>
      <ExternalLink href="https://proj.org/">PROJ</ExternalLink> — відкрита бібліотека на C/C++ для
      перетворення координат між системами. Це стандартний рушій відкритого геопросторового світу:
      на ньому стоять GDAL, QGIS, PostGIS, GRASS і pyproj у Python. З'явився в 1980-х у Геологічній
      службі США, автор — Джеральд Евенден; нині його підтримує спільнота OSGeo під ліцензією MIT.
    </p>
    <p className="mt-2">PROJ чітко розрізняє дві операції:</p>
    <ul className="mt-1 flex list-disc flex-col gap-1 pl-5">
      <li>
        <b>перетворення</b> (conversion) — зміна представлення в межах одного датуму: широта й
        довгота ↔ UTM чи декартові XYZ. Чиста математика проєкцій; методів проєкції в PROJ понад
        сотню;
      </li>
      <li>
        <b>трансформація</b> (transformation) — перехід між датумами, як УСК-2000 ↔ WGS 84. Потрібні
        виміряні параметри: зсуви Гельмерта або сітки поправок NTv2 і NADCON, кожна трансформація зі
        своєю заявленою точністю.
      </li>
    </ul>
    <p className="mt-2">
      Від версії 6 (2019) PROJ містить базу <code className="font-mono">proj.db</code> з реєстром
      EPSG: тисячі систем координат, датумів і трансформацій між ними. На запит «з EPSG:4326 в
      EPSG:5564» він сам знаходить можливі шляхи, сортує їх за точністю й областю дії і бере
      найкращий. Будь-яку операцію PROJ розкладає на конвеєр простих кроків. Для УСК-2000 він такий:
    </p>
    <Pipeline>{"cart (Красовський) → helmert x=24 y=-121 z=-76 → inv cart (WGS 84)"}</Pipeline>
    <p className="mt-1">
      Тобто широту й довготу на еліпсоїді Красовського переводять у декартові XYZ, зсувають на
      вектор EPSG:5840 і повертають до широти й довготи на WGS 84. Цей конвертер робить ті самі
      кроки, лише записані в коді для одного випадку.
    </p>
  </>
);

const PortsAnswer = () => (
  <p>
    У PROJ є порти на інші мови.{" "}
    <ExternalLink href="https://github.com/proj4js/proj4js">proj4js</ExternalLink> — для JavaScript:
    легкий, але без бази EPSG і без сучасної моделі трансформацій, тож визначення систем і параметри
    зсуву датуму передаєш йому сам. MGRS винесено в окремий пакет.{" "}
    <ExternalLink href="https://github.com/locationtech/proj4j">Proj4J</ExternalLink> — те саме для
    Java, від LocationTech. Є й збірки самого PROJ під WebAssembly: повноцінні, але важкі, бо
    тягнуть ту саму базу даних.
  </p>
);

const OwnCodeAnswer = () => (
  <>
    <table>
      <tbody>
        {ADVANTAGES.map(([title, text]) => (
          <tr key={title} className="align-top">
            <th className="py-1 pr-3 text-left font-bold whitespace-nowrap">{title}</th>
            <td className="py-1">{text}</td>
          </tr>
        ))}
      </tbody>
    </table>
    <p className="mt-2">
      Межа цього вибору — охоплення. Конвертер знає рівно ті системи, що перелічені на сторінці.
      Якщо знадобиться проєкція Ламберта, сіткова трансформація чи довільна система з EPSG,
      правильний крок — узяти PROJ, а не дописувати геодезичний рушій заново.
    </p>
  </>
);

// Pulkovo 1942 to WGS 84 in the EPSG registry: one datum, many regional fits.
// The variants of "Pulkovo 1942 to WGS 84 (n)" in the EPSG registry, by their number.
const SK42_TRANSFORMATIONS = [
  ["(1)", "Росія, усереднено — фактично «не використовувати»", "999 м"],
  ["(16)", "уся пострадянська територія", "4,5 м"],
  ["(20)", "Росія", "3 м"],
  ["(7)", "Казахстан", "44 м"],
  ["(2), (6), (21)", "Литва, Латвія, Естонія", "4–9 м"],
];

const Sk42Answer = () => (
  <>
    <p>
      СК-42 (Пулково 1942) — спільна радянська система координат, і визначена вона для всього
      колишнього СРСР, а не для однієї країни. За реєстром EPSG (
      <ExternalLink href="https://epsg.io/4284">EPSG:4284</ExternalLink>) це суходіл Росії від
      Калінінграда до Чукотки, України, Білорусі, Молдови, країн Балтії, Закавказзя й Центральної
      Азії: від 35,14° до 81,91° пн. ш. і від 19,57° сх. д. через антимеридіан до 168,97° зх. д. Для
      країн колишнього Варшавського договору є окремі реалізації — Pulkovo 1942(58) і Pulkovo
      1942(83).
    </p>
    <p className="mt-2">
      Зони Гаусса-Крюгера такі самі шестиградусні, з 4-ї по 32-гу (EPSG:28404–28432), але кожна
      охоплює всі пострадянські країни, через які проходить. Зона 4, наприклад, — це захід України
      до 24° сх. д., Білорусь, Литва, Латвія, Естонія й Калінінград, від 47,95° до 59,44° пн. ш.;
      зона 6 — смуга 30–36° сх. д. від Криму до 70° пн. ш. УСК-2000 використовує лише зони 4–7 і
      лише в межах України.
    </p>
    <p className="mt-2">
      Одного переходу до WGS 84 для такої території немає: реєстр тримає кілька регіональних
      варіантів «Pulkovo 1942 to WGS 84», і глобальний із них найгірший.
    </p>
    <table className="mt-1 w-full">
      <thead>
        <tr>
          <th className="py-0.5 pr-3 text-left">Варіант</th>
          <th className="py-0.5 pr-3 text-left">Де діє</th>
          <th className="py-0.5 text-left">Точність</th>
        </tr>
      </thead>
      <tbody>
        {SK42_TRANSFORMATIONS.map(([name, where, accuracy]) => (
          <tr key={name} className="align-top">
            <td className="py-0.5 pr-3">{name}</td>
            <td className="py-0.5 pr-3">{where}</td>
            <td className="py-0.5 whitespace-nowrap">{accuracy}</td>
          </tr>
        ))}
      </tbody>
    </table>
    <p className="mt-2">
      Еліпсоїд Красовського й проєкція Гаусса-Крюгера в обох систем спільні, тож рядки координат
      виглядають однаково, і за самим рядком СК-42 від УСК-2000 не відрізнити. Різниця лише в
      датумі. Для Києва, за PROJ:
    </p>
    <table className="mt-1 font-mono">
      <tbody>
        <tr>
          <th className="py-0.5 pr-3 text-left font-normal font-sans">СК-42, зона 6</th>
          <td className="py-0.5">5593957 6324232</td>
        </tr>
        <tr>
          <th className="py-0.5 pr-3 text-left font-normal font-sans">УСК-2000, зона 6</th>
          <td className="py-0.5">5593954 6324226</td>
        </tr>
      </tbody>
    </table>
    <p className="mt-2">
      Близько 3 м по X і 6 м по Y. Координати СК-42, прочитані як УСК-2000, зсувають точку на кілька
      метрів, і помітити це за самим рядком неможливо.
    </p>
    <p className="mt-2">
      Цей конвертер СК-42 не підтримує. Додати її нескладно — той самий код з іншим зсувом датуму й
      ширшими зонами; головне рішення — яку з регіональних трансформацій брати для якої території.
    </p>
  </>
);

// MGRS and USNG side by side: one grid, two standards.
const MGRS_USNG_ROWS: [string, ReactNode, ReactNode][] = [
  [
    "Стандарт",
    <>
      <ExternalLink href={`${import.meta.env.BASE_URL}NGA_STND_0037_2.0.0_GRIDS.pdf`}>
        NGA.STND.0037
      </ExternalLink>
      , військовий (НАТО)
    </>,
    <>
      <ExternalLink href="https://www.fgdc.gov/standards/projects/FGDC-standards-projects/usng/fgdc_std_011_2001_usng.pdf">
        FGDC-STD-011-2001
      </ExternalLink>
      , цивільний (США)
    </>,
  ],
  ["Де діє", "уся Земля, полярні шапки — через UPS", "США та їхні території"],
  ["Датум", "WGS 84", "NAD 83, або NAD 27 з позначкою «(NAD 27)»"],
  [
    "Найгрубіше посилання",
    "зона 36U або квадрат 100 км 36UUA",
    "квадрат 10 км — хоч одна цифра на вісь",
  ],
  ["Запис", "зазвичай злито: 18TWL8395907350", "з пробілами: 18T WL 83959 07350"],
  [
    "Скорочений запис",
    "немає",
    "зону й квадрат можна відкинути, якщо вони спільні для всього документа: 83959 07350",
  ],
];

const MgrsUsngAnswer = () => (
  <>
    <p>
      По суті USNG — це MGRS, прийнятий у США як цивільний стандарт. Сітка, літери квадратів і
      правила обрізання цифр у них спільні, тож для однієї точки й однієї точності вони дають той
      самий квадрат — і на карті він той самий.
    </p>
    <table className="mt-2">
      <thead>
        <tr>
          <th />
          <th className="py-0.5 pr-3 text-left">MGRS</th>
          <th className="py-0.5 text-left">USNG</th>
        </tr>
      </thead>
      <tbody>
        {MGRS_USNG_ROWS.map(([what, mgrs, usng]) => (
          <tr key={what} className="align-top">
            <th className="py-0.5 pr-3 text-left font-normal whitespace-nowrap opacity-60">
              {what}
            </th>
            <td className="py-0.5 pr-3">{mgrs}</td>
            <td className="py-0.5">{usng}</td>
          </tr>
        ))}
      </tbody>
    </table>
    <p className="mt-2">
      Датум майже нічого не змінює: офіційний перехід NAD 83 → WGS 84 у реєстрі EPSG — нульовий зсув
      із похибкою 4 м. Різниця реальна, близько одного-двох метрів, але менша за похибку самого
      переходу, тож за рядком MGRS і USNG не розрізнити — автовизначення тут завжди скаже «MGRS».
      Помітна в самому рядку лише точність: «10S GJ» — валідний MGRS, але не USNG. NAD 27 — інша
      справа: там зсув уже десятки метрів, тому FGDC і вимагає для нього окремої позначки.
    </p>
    <p className="mt-2">
      Цей конвертер рахує обидва однаково, на WGS 84; для USNG на NAD 83 це метр-два, у межах
      точності метрового квадрата. USNG на NAD 27 і скорочені записи без зони він не читає. Тому
      MGRS і USNG тут в одному розділі й з однією сіткою на карті: квадрат той самий, різниться
      тільки запис.
    </p>
  </>
);

// Questions that come up about how the converter works, each folded until it is opened.
const QUESTIONS: { question: string; answer: ReactNode }[] = [
  { question: "Що таке PROJ і що він робить?", answer: <ProjAnswer /> },
  { question: "А proj4js чи Proj4J?", answer: <PortsAnswer /> },
  { question: "Чому тут власний код, а не одна з цих бібліотек?", answer: <OwnCodeAnswer /> },
  {
    question: "Чому ArcGIS рахує через WebAssembly, а тут вистачає кількох сотень рядків?",
    answer: <WasmAnswer />,
  },
  { question: "Чим СК-42 відрізняється від УСК-2000?", answer: <Sk42Answer /> },
  { question: "Чим MGRS відрізняється від USNG?", answer: <MgrsUsngAnswer /> },
];

const QuestionsAndAnswers = () => (
  <section className="mt-10 text-sm">
    <h2 className="text-lg font-bold tracking-tight">Питання й відповіді</h2>
    <div className="mt-3 flex flex-col gap-2">
      {QUESTIONS.map(({ question, answer }) => (
        <details key={question} className="group card px-3 py-2.5">
          <summary className="flex cursor-pointer list-none items-center gap-2 font-bold [&::-webkit-details-marker]:hidden">
            <span className="inline-block w-3 text-xs opacity-50 transition-transform group-open:rotate-90">
              ▶
            </span>
            {question}
          </summary>
          <div className="prose prose-sm prose-ink mt-3 max-w-none border-t border-line pt-1 pl-5">
            {answer}
          </div>
        </details>
      ))}
    </div>
  </section>
);

// The map layers each section can switch on; the map's legend switches the same ones.
const SECTION_LAYERS: Record<SectionId, { layer: keyof MapLayers; label: string }[]> = {
  WGS84: [],
  MGRS: [{ layer: "mgrsGrid", label: "показати сітку MGRS / USNG" }],
  UTM: [{ layer: "utmZones", label: "показати зони сітки UTM" }],
  "UCS-2000": [
    { layer: "ucs2000Areas", label: "підсвітити зону визначення" },
    { layer: "ucs2000Strips", label: "показати смуги, де рахується перетворення" },
  ],
};

export const ConverterPage = ({ header }: { header: ReactNode }) => {
  const [text, setText] = useState("");
  const [input, setInput] = useState<InputChoice>(AUTO);
  const [precision, setPrecision] = useState<GridPrecision>(1);
  // False while the input is a point just picked on the map, so the map does not move under the
  // user's cursor; anything else they change brings the view back onto the result.
  const [fitView, setFitView] = useState(true);
  // The user's own switch: off, the map never moves on its own, whatever changes.
  const [followResult, setFollowResult] = useState(true);
  const [layers, setLayers] = useState<MapLayers>({
    ucs2000Areas: false,
    ucs2000Strips: false,
    utmZones: false,
    mgrsGrid: false,
  });
  const [open, setOpen] = useState<Record<SectionId, boolean>>({
    WGS84: false,
    MGRS: true,
    UTM: false,
    "UCS-2000": false,
  });
  const [shown, setShown] = useState<Record<SectionId, boolean>>({
    WGS84: true,
    MGRS: true,
    UTM: true,
    "UCS-2000": true,
  });

  const [picking, setPicking] = useState(false);
  useEffect(() => {
    if (!picking) return;
    const cancel = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPicking(false);
    };
    window.addEventListener("keydown", cancel);
    return () => window.removeEventListener("keydown", cancel);
  }, [picking]);

  const outcome = convert(text, input);
  // What is wrong with the input, shown under the field and turning it red; null when nothing is.
  const inputError: ReactNode =
    outcome.kind === "parseError" ? (
      <span className="font-mono">{outcome.message}</span>
    ) : outcome.kind === "conversionError" ? (
      <>
        Розпізнано як {labelOf(outcome.written)}, але перетворити не вдалося:{" "}
        <span className="font-mono">{outcome.message}</span>
      </>
    ) : null;

  const results = new Map(
    sections.map((section) => [
      section.id,
      outcome.kind === "converted" ? resultOf(section, outcome.area, precision) : null,
    ]),
  );

  // A converted value is fed back in under its own system rather than through auto-detection:
  // auto-detection would read a WGS84R pair as WGS84 and a USNG reference as MGRS.
  const pick: Pick = ({ system, value }) => {
    setText(value);
    setInput(systemOf(system));
    setFitView(true);
  };

  return (
    <div className="lg:grid lg:h-screen lg:grid-cols-[minmax(0,60ch)_1fr]">
      <div className="p-4 lg:overflow-y-auto">
        {header}
        <div className="flex flex-wrap items-center gap-1.5 text-sm">
          <span className="opacity-60">Приклади:</span>
          {EXAMPLE_SYSTEMS.map((system) => (
            <button
              key={system}
              type="button"
              title="Підставити як вхідне значення"
              className="group inline-flex cursor-pointer overflow-hidden rounded-full border border-black text-xs"
              onClick={() => pick({ system, value: examples[system] })}
            >
              <span className="bg-black px-2 py-0.5 font-bold text-white">
                {system === "UCS-2000" ? "УСК-2000" : system}
              </span>
              <span className="px-2 py-0.5 font-mono group-hover:bg-black/10">
                {examples[system]}
              </span>
            </button>
          ))}
        </div>
        {/* A grid rather than a row, so the error can sit under the coordinates field without
            lifting it out of line with the select and the button. */}
        <div className="mt-3 grid grid-cols-[30%_minmax(0,1fr)_auto] items-end gap-x-2 gap-y-1">
          <FieldLabel htmlFor={SYSTEM_SELECT_ID}>Система</FieldLabel>
          <FieldLabel htmlFor={COORDINATES_INPUT_ID}>Координати</FieldLabel>
          <span />

          <SystemSelect
            value={input}
            onChange={(value) => {
              setInput(value);
              setFitView(true);
            }}
          />
          <input
            id={COORDINATES_INPUT_ID}
            type="text"
            className={`field w-full ${
              inputError === null ? "" : "border-red-600! focus-visible:outline-red-600"
            }`}
            placeholder={input === AUTO ? "Enter coordinates" : examples[input]}
            value={text}
            aria-invalid={inputError !== null}
            aria-describedby={inputError === null ? undefined : COORDINATES_ERROR_ID}
            onChange={(e) => {
              setText(e.target.value);
              setFitView(true);
            }}
          />
          <button
            type="button"
            aria-pressed={picking}
            title="Вибрати точку на карті"
            aria-label="Вибрати точку на карті"
            className={`field cursor-pointer whitespace-nowrap text-base ${
              picking ? "border-ink bg-ink" : "hover:border-ink"
            }`}
            onClick={() => setPicking(!picking)}
          >
            🎯
          </button>

          <p
            id={COORDINATES_ERROR_ID}
            aria-live="polite"
            className="col-span-2 col-start-2 text-xs text-red-700 empty:hidden"
          >
            {inputError}
          </p>
        </div>

        <label className="mt-2 flex w-fit cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={followResult}
            onChange={(e) => {
              setFollowResult(e.target.checked);
              setFitView(true);
            }}
          />
          Наближати карту до результату
        </label>

        <div className="mt-4 text-sm">
          {outcome.kind === "empty" && (
            <p className="opacity-60">
              {input === AUTO
                ? "Введіть координати в будь-якому підтримуваному форматі."
                : `Введіть координати в системі ${systemLabel(input)}, наприклад ${examples[input]}`}
            </p>
          )}
          {outcome.kind === "converted" && (
            <>
              {/* Plain decimal latitude and longitude needs no telling; any other notation does. */}
              {(input === AUTO || input === "WGS84") &&
                !(outcome.written.length === 2 && outcome.written[1] === "WGS84") && (
                  <p>
                    Розпізнано як <b>{labelOf(outcome.written)}</b>
                  </p>
                )}
              {outcome.written[0].system === "UCS-2000" &&
                !insideUcs2000AreaOfUse(outcome.area.centre) && <OutsideAreaOfUse />}
            </>
          )}
        </div>

        <div className="mt-4 flex flex-col gap-2 text-sm">
          {sections.map((section) => {
            const result = results.get(section.id) ?? null;
            return (
              <Accordion
                key={section.id}
                title={section.title}
                summary={summaryOf(result)}
                open={open[section.id]}
                onToggle={() => setOpen({ ...open, [section.id]: !open[section.id] })}
                shown={shown[section.id]}
                onShow={(value) => {
                  setShown({ ...shown, [section.id]: value });
                  setFitView(true);
                }}
              >
                {SECTION_LAYERS[section.id].length > 0 && (
                  <div className="mb-2 flex flex-col gap-1">
                    {SECTION_LAYERS[section.id].map(({ layer, label }) => (
                      <label key={layer} className="flex w-fit cursor-pointer items-center gap-2">
                        <input
                          type="checkbox"
                          checked={layers[layer]}
                          onChange={(e) => setLayers({ ...layers, [layer]: e.target.checked })}
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                )}
                <SectionBody
                  section={section}
                  result={result}
                  precision={precision}
                  onPrecision={(value) => {
                    setPrecision(value);
                    setFitView(true);
                  }}
                  onPick={pick}
                />
              </Accordion>
            );
          })}
        </div>

        <section className="prose prose-sm prose-ink mt-8 max-w-none opacity-80">
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

        <QuestionsAndAnswers />
      </div>

      <div className="h-[60vh] lg:h-full">
        <ConverterMap
          centre={outcome.kind === "converted" ? outcome.area.centre : null}
          inputArea={outcome.kind === "converted" ? outcome.area : null}
          outputSquares={sections.flatMap((section) =>
            shown[section.id] ? squaresForMap(results.get(section.id)?.coverage ?? null) : [],
          )}
          outputPoints={outcome.kind === "converted" && shown.WGS84 ? [outcome.area.centre] : []}
          picking={picking}
          // A point picked on the map is written in the system chosen for input, so the field reads
          // as if it had been typed; under auto-detection, as plain WGS 84. A system that cannot
          // express the point — UCS-2000 outside Ukraine — falls back to WGS 84 as well.
          onPick={(coords) => {
            const conversion = tryFromWGS84(coords, input === AUTO ? "WGS84" : input);
            if ("value" in conversion) {
              setText(conversion.value);
            } else {
              setText(fromWGS84(coords, "WGS84").value);
              setInput("WGS84");
            }
            setFitView(false);
            setPicking(false);
          }}
          fitView={followResult && fitView}
          layers={layers}
          onLayersChange={setLayers}
        />
      </div>
    </div>
  );
};
