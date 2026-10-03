import { type ReactNode, useState } from "react";
import { ConverterMap, type OutputSquare } from "./ConverterMap.tsx";
import {
  type Area,
  areaOf,
  type Conversion,
  type CoordinateSystem,
  GRID_SYSTEMS,
  type GridPrecision,
  LATITUDE_LONGITUDE_NOTATIONS,
  tryFromWGS84,
} from "./converters/coordinateConverter.ts";
import { type Coverage, coveringSquares, MAX_COVERING_SQUARES } from "./converters/coverage.ts";
import { formatWGS84 } from "./converters/sexagesimalFormat.ts";
import { coordinateParser, systemParsers } from "./parsers/coordinateParser.ts";

const AUTO = "auto";

type InputChoice = CoordinateSystem | typeof AUTO;

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

// The examples: WGS 84 once, as the plain signed pair, plus the grids. The other notations are the
// same latitude and longitude written differently; they are still read on input.
const EXAMPLE_SYSTEMS: CoordinateSystem[] = ["WGS84", ...GRID_SYSTEMS];

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

const SystemSelect = ({
  value,
  onChange,
}: {
  value: InputChoice;
  onChange: (value: InputChoice) => void;
}) => (
  <label className="flex min-w-0 flex-col gap-1 text-sm">
    <span className="truncate opacity-60">Вводимо в системі</span>
    <select
      className="w-full p-2 border rounded-sm bg-transparent"
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
  system: CoordinateSystem;
  onPick: (conversion: { system: CoordinateSystem; value: string }) => void;
}) => {
  if (coverage?.kind === "tooMany") {
    return (
      <p className="mt-3 opacity-60">
        Вхідна зона охоплює близько {coverage.count.toLocaleString("uk-UA")}{" "}
        {squaresWord(coverage.count)} {system} — забагато, щоб перелічити (межа —{" "}
        {MAX_COVERING_SQUARES}). Оберіть грубішу точність.
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
  systems: CoordinateSystem[];
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

const coverageOf = (area: Area, system: CoordinateSystem, precision: GridPrecision) => {
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
  <section className="border-t py-2">
    <div className="flex items-center gap-2">
      {/* The checkbox sits beside the toggle rather than inside it, so ticking it never folds the section. */}
      <button
        type="button"
        aria-expanded={open}
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left"
        onClick={onToggle}
      >
        <span className="w-3 opacity-60">{open ? "▾" : "▸"}</span>
        <span className="font-bold whitespace-nowrap">{title}</span>
        {!open && <span className="truncate font-mono opacity-60">{summary}</span>}
      </button>
      <label className="flex cursor-pointer items-center gap-1 whitespace-nowrap text-xs">
        <input type="checkbox" checked={shown} onChange={(e) => onShow(e.target.checked)} />
        на карті
      </label>
    </div>
    {open && <div className="mt-2 pl-5">{children}</div>}
  </section>
);

const summaryOf = (result: SectionResult | null) => {
  const first = result?.conversions[0];
  if (first === undefined) return "—";
  return "value" in first ? first.value : "не перетворюється";
};

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
  onPick: (conversion: { system: CoordinateSystem; value: string }) => void;
}) => {
  const [first] = result?.conversions ?? [];

  return (
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

          {section.id === "WGS84" ? (
            <p className="mt-1 opacity-60">Так точка зберігається в базі.</p>
          ) : (
            first !== undefined && "area" in first && <AreaTable area={first.area} />
          )}

          <CoverageList coverage={result.coverage} system={section.systems[0]} onPick={onPick} />
        </>
      )}
    </>
  );
};

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

// Questions that come up about how the converter works, each folded until it is opened.
const QUESTIONS: { question: string; answer: ReactNode }[] = [
  { question: "Що таке PROJ і що він робить?", answer: <ProjAnswer /> },
  { question: "А proj4js чи Proj4J?", answer: <PortsAnswer /> },
  { question: "Чому тут власний код, а не одна з цих бібліотек?", answer: <OwnCodeAnswer /> },
  {
    question: "Чому ArcGIS рахує через WebAssembly, а тут вистачає кількох сотень рядків?",
    answer: <WasmAnswer />,
  },
];

const QuestionsAndAnswers = () => (
  <section className="mt-6 text-sm">
    <h3 className="font-bold">Питання й відповіді</h3>
    <div className="mt-1">
      {QUESTIONS.map(({ question, answer }) => (
        <details key={question} className="border-t py-2">
          <summary className="cursor-pointer font-bold">{question}</summary>
          <div className="mt-2 pl-4">{answer}</div>
        </details>
      ))}
    </div>
  </section>
);

export const ConverterPage = ({ header }: { header: ReactNode }) => {
  const [text, setText] = useState("");
  const [input, setInput] = useState<InputChoice>(AUTO);
  const [precision, setPrecision] = useState<GridPrecision>(1);
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

  const outcome = convert(text, input);
  const results = new Map(
    sections.map((section) => [
      section.id,
      outcome.kind === "converted" ? resultOf(section, outcome.area, precision) : null,
    ]),
  );

  // A converted value is fed back in under its own system rather than through auto-detection:
  // auto-detection would read a WGS84R pair as WGS84 and a USNG reference as MGRS.
  const pick = ({ system, value }: { system: CoordinateSystem; value: string }) => {
    setText(value);
    setInput(system);
  };

  const outputSquares = sections.flatMap((section) =>
    shown[section.id] ? squaresForMap(results.get(section.id)?.coverage ?? null) : [],
  );
  const outputPoints = outcome.kind === "converted" && shown.WGS84 ? [outcome.area.centre] : [];

  return (
    <div className="lg:grid lg:h-screen lg:grid-cols-[minmax(0,60ch)_1fr]">
      <div className="p-4 lg:overflow-y-auto">
        {header}
        <SystemSelect value={input} onChange={setInput} />

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
              {outcome.area.corners !== null && (
                <div className="mt-2">
                  <AreaTable area={outcome.area} caption="Вхідне значення — квадрат" />
                </div>
              )}
              <a
                href={`https://www.openstreetmap.org/?mlat=${outcome.area.centre.latitude}&mlon=${outcome.area.centre.longitude}#map=15/${outcome.area.centre.latitude}/${outcome.area.centre.longitude}`}
                target="_blank"
                rel="noreferrer"
                className={`${linkStyle} mt-2 inline-block`}
              >
                показати на карті
              </a>
            </>
          )}
        </div>

        <div className="mt-4 text-sm">
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
                onShow={(value) => setShown({ ...shown, [section.id]: value })}
              >
                <SectionBody
                  section={section}
                  result={result}
                  precision={precision}
                  onPrecision={setPrecision}
                  onPick={pick}
                />
              </Accordion>
            );
          })}
        </div>

        <section className="mt-6 text-sm">
          <h3 className="font-bold">Приклади</h3>
          <ul className="mt-1 flex flex-col gap-1">
            {EXAMPLE_SYSTEMS.map((system) => (
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

        <QuestionsAndAnswers />
      </div>

      <div className="h-[60vh] lg:h-full">
        <ConverterMap
          centre={outcome.kind === "converted" ? outcome.area.centre : null}
          inputArea={outcome.kind === "converted" ? outcome.area : null}
          outputSquares={outputSquares}
          outputPoints={outputPoints}
        />
      </div>
    </div>
  );
};
