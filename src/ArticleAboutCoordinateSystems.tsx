import type { ReactNode } from "react";
import latitudeLongitudeSvg from "./assets/latitude-longitude.svg?raw";
import utmZonesSvg from "./assets/utm-zones.svg?raw";

// A guide to every format this library parses. Written because no single source covers all nine:
// they come from four separate traditions — ISO, NGA/NATO, FGDC and Soviet-Ukrainian geodesy — and
// UCS-2000 in particular has no treatment alongside MGRS in any language.
//
// Every number here was computed or verified rather than copied from a survey. The UTM value for
// the reference point comes from a forward projection whose implementation was checked against two
// independent anchors: the WGS84 meridian quadrant (10 001 965.729 m, matched to 0.5 mm) and the
// documented minimum easting at the equator (166 021 m).

const Heading = ({ children }: { children: ReactNode }) => (
  <h3 className="mt-6 font-bold">{children}</h3>
);

const Subheading = ({ children }: { children: ReactNode }) => (
  <h4 className="mt-4 font-bold opacity-80">{children}</h4>
);

const P = ({ children }: { children: ReactNode }) => <p className="mt-2">{children}</p>;

const Code = ({ children }: { children: ReactNode }) => (
  <code className="font-mono">{children}</code>
);

const Sample = ({ children }: { children: ReactNode }) => (
  <pre className="mt-2 overflow-x-auto font-mono opacity-80">{children}</pre>
);

const Link = ({ href, children }: { href: string; children: ReactNode }) => (
  <a
    href={href}
    target="_blank"
    rel="noreferrer"
    className="underline underline-offset-2 hover:no-underline"
  >
    {children}
  </a>
);

// Every stroke and label is currentColor so the drawings follow the page foreground. The one
// literal hue marks the element each figure is actually about — the fractional component, the
// square being named, the zone the reference point falls in — and reads on both light and dark.
const ACCENT = "#d97757";

const Diagram = ({
  viewBox,
  label,
  caption,
  children,
}: {
  viewBox: string;
  label: string;
  caption: ReactNode;
  children: ReactNode;
}) => (
  <figure className="mt-4">
    <svg viewBox={viewBox} role="img" aria-label={label} className="h-auto w-full">
      {children}
    </svg>
    <figcaption className="mt-2 opacity-60">{caption}</figcaption>
  </figure>
);

const Boxed = ({
  x,
  y,
  width,
  text,
  accent,
}: {
  x: number;
  y: number;
  width: number;
  text: string;
  accent?: boolean;
}) => (
  <>
    <rect
      x={x}
      y={y - 15}
      width={width}
      height={30}
      rx={3}
      fill={accent ? ACCENT : "none"}
      fillOpacity={accent ? 0.18 : 0}
      stroke={accent ? ACCENT : "currentColor"}
      strokeOpacity={accent ? 1 : 0.45}
    />
    <text
      x={x + width / 2}
      y={y + 5}
      textAnchor="middle"
      fontSize={14}
      fontFamily="monospace"
      fill="currentColor"
    >
      {text}
    </text>
  </>
);

// A 10 x 10 subdivision of one square, with a single cell picked out. Column counts east from the
// left; row counts north from the bottom, which is why the y is measured up from the base.
const GridSquare = ({
  x,
  y,
  side,
  column,
  row,
}: {
  x: number;
  y: number;
  side: number;
  column: number;
  row: number;
}) => {
  const cell = side / 10;
  const ticks = Array.from({ length: 9 }, (_, index) => index + 1);
  return (
    <>
      {ticks.map((index) => (
        <line
          key={`v${index}`}
          x1={x + index * cell}
          y1={y}
          x2={x + index * cell}
          y2={y + side}
          stroke="currentColor"
          strokeOpacity={0.2}
        />
      ))}
      {ticks.map((index) => (
        <line
          key={`h${index}`}
          x1={x}
          y1={y + index * cell}
          x2={x + side}
          y2={y + index * cell}
          stroke="currentColor"
          strokeOpacity={0.2}
        />
      ))}
      <rect
        x={x + column * cell}
        y={y + side - (row + 1) * cell}
        width={cell}
        height={cell}
        fill={ACCENT}
        fillOpacity={0.3}
        stroke={ACCENT}
      />
      <rect x={x} y={y} width={side} height={side} fill="none" stroke="currentColor" />
    </>
  );
};

// An illustration someone else drew. Inlined into the page rather than loaded through <img>: an
// <img> is an isolated document that cannot see the page's webfonts or inherit currentColor, so a
// map referenced that way would always fall back to a system font. Inlined, its labels pick up
// iA Writer Quattro from the page and its ink follows the text colour, exactly like the diagrams
// drawn by hand above. The source files keep their geometry; only palette, line weights and the
// font declaration were changed.
//
// `fullBleed` lets a wide illustration escape the 60ch reading column and span the viewport, less a
// margin on each side. `left-1/2` moves it to the column's centre, which is also the viewport's
// centre because <main> is centred; the negative translate then pulls back half its own width.
// Subtracting 2rem from 100vw also absorbs a classic scrollbar, so the page never scrolls sideways.
// Only the drawing breaks out — the caption stays in the column, where its lines remain readable.
const FULL_BLEED = "relative left-1/2 w-[calc(100vw-2rem)] max-w-none -translate-x-1/2";

// innerHTML parses as HTML, which has no use for an XML prolog or a DOCTYPE.
const svgBody = (markup: string) => markup.slice(markup.indexOf("<svg"));

const Illustration = ({
  markup,
  label,
  caption,
  credit,
  fullBleed,
}: {
  markup: string;
  label: string;
  caption: ReactNode;
  credit: ReactNode;
  fullBleed?: boolean;
}) => (
  <figure className="mt-4">
    <div
      role="img"
      aria-label={label}
      className={`[&>svg]:h-auto [&>svg]:w-full ${fullBleed ? `my-4 ${FULL_BLEED}` : ""}`}
      // Both files were downloaded, read and edited by hand; neither contains script or external
      // references, and nothing here comes from user input.
      dangerouslySetInnerHTML={{ __html: svgBody(markup) }}
    />
    <figcaption className="mt-2 opacity-60">
      {caption} <span className="opacity-80">{credit}</span>
    </figcaption>
  </figure>
);

const Table = ({
  headers,
  rows,
  caption,
}: {
  headers: ReactNode[];
  rows: ReactNode[][];
  caption?: ReactNode;
}) => (
  <figure className="mt-2">
    <div className="overflow-x-auto">
      <table className="border-collapse">
        <thead>
          <tr>
            {headers.map((header, column) => (
              <th key={column} className="border-b px-2 py-1 text-left font-bold">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((cells, row) => (
            <tr key={row}>
              {cells.map((cell, column) => (
                <td key={column} className="border-b px-2 py-1 align-top">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    {caption && <figcaption className="mt-2 opacity-60">{caption}</figcaption>}
  </figure>
);

export const ArticleAboutCoordinateSystems = () => (
  <article className="mt-8 text-sm">
    <h2 className="text-lg font-bold">Дев'ять способів записати одну точку</h2>

    <P>
      Путівник координатними системами, які парсить ця бібліотека. Написаний тому, що єдиного
      джерела на всі дев'ять форматів немає: вони походять з чотирьох різних традицій — ISO,
      NGA/NATO, FGDC та радянсько-української геодезії — і автори з однієї традиції зазвичай не
      пишуть про інші. Зокрема, опису УСК-2000 поруч із MGRS не існує ані англійською, ані
      українською.
    </P>

    <Heading>Шар, який зазвичай пропускають</Heading>
    <P>
      Питання «в якій системі координат ця точка?» насправді складається з чотирьох окремих питань,
      і плутанина між ними — джерело майже всіх пасток нижче.
    </P>
    <ol className="mt-2 flex list-decimal flex-col gap-1 pl-5">
      <li>
        <b>Яка форма Землі?</b> Еліпсоїд. WGS84 користується еліпсоїдом WGS 84 (велика піввісь 6 378
        137 м), УСК-2000 — еліпсоїдом Красовського 1940 року (6 378 245 м). Різниця — 108 метрів.
      </li>
      <li>
        <b>Як цей еліпсоїд прив'язаний до Землі?</b> Датум. Два однакові еліпсоїди можуть давати
        різні координати, бо по-різному «посаджені» на планету. Саме тому УСК-2000 і СК-42 — різні
        системи, попри спільний еліпсоїд.
      </li>
      <li>
        <b>Як тривимірна поверхня стає пласкою?</b> Проєкція. Широта й довгота її не потребують.
        UTM, MGRS, USNG та УСК-2000 — потребують, і всі користуються поперечною проєкцією Меркатора.
      </li>
      <li>
        <b>Як це записати рядком?</b> Нотація. Тут живуть DD, DDM і DMS — це не окремі системи, а
        три способи записати ту саму широту й довготу.
      </li>
    </ol>
    <P>
      Ключове, з чого випливає половина проблем: <b>рядок майже ніколи не несе датуму</b>.{" "}
      <Code>50.4501, 30.5234</Code> не каже, чи це WGS84. <Code>10S GJ 06832 44683</Code> не каже,
      чи це MGRS, чи USNG. Парсер відновлює структуру запису, але не систему відліку — її має знати
      той, хто дав дані.
    </P>

    <Heading>Родина перша: широта й довгота</Heading>
    <P>
      Перш ніж говорити про записи, варто пам'ятати, що саме записується. Широта й довгота — це не
      відстані, а <b>два кути</b>. Усе інше в цій статті — лише способи ці два кути записати.
    </P>
    <Illustration
      markup={latitudeLongitudeSvg}
      label="Куля з сіткою паралелей і меридіанів: широта φ — кут від площини екватора, довгота λ — кут від Гринвіцького меридіана"
      caption={
        <>
          Широта <Code>φ</Code> — кут від площини екватора, довгота <Code>λ</Code> — кут у площині
          екватора від Гринвіцького меридіана. Сітка проведена через 10°. Земля тут показана кулею,
          тож обидва кути мають вершину в центрі; на справжньому еліпсоїді широта відлічується
          інакше — про це наступний підрозділ.
        </>
      }
      credit={
        <>
          Ілюстрація:{" "}
          <Link href="https://commons.wikimedia.org/wiki/File:Latitude_and_longitude_graticule_on_a_sphere.svg">
            Latitude and longitude graticule on a sphere
          </Link>{" "}
          — Peter Mercator, Wikimedia Commons, суспільне надбання. Перефарбовано під стиль статті,
          лінії потоншено; геометрія й підписи оригіналу збережені.
        </>
      }
    />
    <Subheading>Від нормалі, а не від центру</Subheading>
    <P>
      Здається природним, що широта — це кут радіуса, проведеного з центру Землі. На кулі так і є,
      але Земля не куля, а сплюснутий еліпсоїд, і всі системи в цій статті користуються{" "}
      <b>геодезичною</b> широтою: кутом між <b>нормаллю до поверхні</b> й площиною екватора. Нормаль
      до еліпсоїда не проходить через центр — крім екватора й полюсів.
    </P>
    <P>
      Різниця не косметична. Кут від центру (геоцентрична широта) відхиляється від геодезичної
      максимум на 11.55′ поблизу 45°, а це <b>близько 21 кілометра</b> на місцевості. На широті
      Києва — 11.34′, майже ті самі 21 км. Довготи це не стосується: вона вимірюється в площині
      екватора, де обидва означення збігаються.
    </P>

    <P>
      Чотири з дев'яти форматів — це одна пара чисел, записана чотирма способами. Усі описані в{" "}
      <Link href="https://www.iso.org/standard/75147.html">ISO 6709</Link>, і стандарт містить{" "}
      <b>два різні записи</b>. Нормативний машинний (Annex H) знаковий, фіксованої ширини, без
      символів: <Code>+50.4501+030.5234/</Code>. Людиночитний (Annex D) — зі знаком градуса й
      літерами півкуль: <Code>50°40′46″N 95°48′26″W</Code>.
    </P>
    <P>
      Наш <Code>WGS84</Code> — запис у дусі Annex H: напрямок задає знак. <Code>DD</Code>,{" "}
      <Code>DDM</Code> і <Code>DMS</Code> — Annex D: напрямок задає літера. Це і є вся різниця між
      WGS84 та DD, і саме тому літера в DD обов'язкова: без неї два формати нічим не відрізнити.
    </P>
    <P>
      Три нотації Annex D відрізняються тим, <b>який компонент бере дробову частину</b>:
    </P>
    <Table
      headers={["", "Запис", "Дробову частину бере"]}
      rows={[
        ["DD", <Code key="dd">50.4501°N</Code>, "градуси"],
        ["DDM", <Code key="ddm">50° 27.006'N</Code>, "хвилини"],
        ["DMS", <Code key="dms">50° 27' 0.36"N</Code>, "секунди"],
      ]}
    />
    <P>
      Перехід механічний: <Code>0.4501° × 60 = 27.006′</Code>, далі <Code>0.006′ × 60 = 0.36″</Code>
      . Кожна сходинка додає один цілий компонент і зсуває дріб на рівень нижче.
    </P>
    <Diagram
      viewBox="0 0 400 190"
      label="Одна широта 50.4501° у трьох нотаціях: дробова частина щоразу множиться на 60 і переходить у наступний компонент"
      caption={
        <>
          Та сама широта 50.4501°. Дробова частина (виділена) нікуди не дівається — вона множиться
          на 60 і стає наступним компонентом, а цілі частини накопичуються зліва. Тому всі три
          записи дають однакове число, а не три різні точки.
        </>
      }
    >
      <defs>
        <marker
          id="cascade-arrow"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto"
        >
          <polygon points="0,0 10,5 0,10" fill={ACCENT} />
        </marker>
      </defs>

      <text x={4} y={47} fontSize={12} fill="currentColor" fillOpacity={0.7}>
        DD
      </text>
      <Boxed x={44} y={42} width={40} text="50" />
      <Boxed x={84} y={42} width={68} text=".4501" accent />
      <text x={158} y={47} fontSize={14} fill="currentColor">
        °
      </text>

      <text x={4} y={105} fontSize={12} fill="currentColor" fillOpacity={0.7}>
        DDM
      </text>
      <Boxed x={44} y={100} width={40} text="50" />
      <text x={90} y={105} fontSize={14} fill="currentColor">
        °
      </text>
      <Boxed x={106} y={100} width={40} text="27" />
      <Boxed x={146} y={100} width={56} text=".006" accent />
      <text x={208} y={105} fontSize={14} fill="currentColor">
        ′
      </text>

      <text x={4} y={163} fontSize={12} fill="currentColor" fillOpacity={0.7}>
        DMS
      </text>
      <Boxed x={44} y={158} width={40} text="50" />
      <text x={90} y={163} fontSize={14} fill="currentColor">
        °
      </text>
      <Boxed x={106} y={158} width={40} text="27" />
      <text x={152} y={163} fontSize={14} fill="currentColor">
        ′
      </text>
      <Boxed x={168} y={158} width={30} text="0" />
      <Boxed x={198} y={158} width={48} text=".36" accent />
      <text x={252} y={163} fontSize={14} fill="currentColor">
        ″
      </text>

      <path
        d="M 118 60 C 118 78, 174 66, 174 83"
        fill="none"
        stroke={ACCENT}
        markerEnd="url(#cascade-arrow)"
      />
      <text x={196} y={78} fontSize={12} fill={ACCENT}>
        × 60
      </text>
      <path
        d="M 174 118 C 174 136, 222 124, 222 141"
        fill="none"
        stroke={ACCENT}
        markerEnd="url(#cascade-arrow)"
      />
      <text x={244} y={136} fontSize={12} fill={ACCENT}>
        × 60
      </text>
    </Diagram>

    <Subheading>Скільки знаків має сенс</Subheading>
    <P>Бібліотека обмежує точність сімома знаками після коми в градусах. Ось чому:</P>
    <Table
      headers={["Знаків", "Роздільна здатність"]}
      rows={[
        ["0", "~111 км"],
        ["2", "~1.1 км"],
        ["4", "~11 м"],
        ["7", "~1.1 см"],
      ]}
    />
    <P>
      Сім знаків — приблизно сантиметр, дрібніше за будь-який побутовий GPS. Восьмий знак не несе
      інформації, лише створює ілюзію точності.
    </P>

    <Subheading>Пастка: порядок значень</Subheading>
    <P>
      <Code>30.5234, 50.4501</Code> — це довгота й широта, чи широта й довгота?{" "}
      <b>Здогадатись неможливо.</b> Обидва числа лежать у допустимих межах для обох ролей, і рядок
      не містить нічого, що дозволило б обрати.
    </P>
    <P>
      Порядок відновлюється лише коли перше число перевищує 90 — тоді воно може бути лише довготою.
      Тому <Code>WGS84R</Code> досяжний лише для таких входів, як Сідней{" "}
      <Code>151.2093, -33.8688</Code>. А от у DD проблема зникає: <Code>30.5234°E, 50.4501°N</Code>{" "}
      однозначний, бо <Code>E</Code> може бути лише довготою. Літери коштують кількох символів, але
      роблять запис самоописовим.
    </P>

    <Heading>Родина друга: сітки</Heading>
    <P>
      UTM, MGRS і USNG — не три системи, а одна, записана з різною деталізацією. MGRS — це UTM,
      переписаний літерами. USNG — це MGRS, звужений.
    </P>

    <Subheading>UTM: основа</Subheading>
    <P>
      Земля між 80°пд.ш. і 84°пн.ш. ділиться на <b>60 зон по 6° довготи</b>. Easting відлічується
      від умовного початку за 500 000 м на захід від центрального меридіана, тож на самому меридіані
      він дорівнює рівно 500 000. Northing на північ від екватора йде від нуля, а на південь — від
      10 000 000. І те, і те зроблено, щоб уникнути від'ємних чисел.
    </P>
    <P>
      Звідси наслідок, який ламає більшість наївних регекспів: <b>northing не завжди семизначний</b>
      . Точка на 5° північної широти має northing близько 553 000 — шість цифр.
    </P>
    <P>
      Реальний діапазон easting усередині зони на екваторі — від <b>166 021</b> до <b>833 979</b>{" "}
      метрів. Це не кругле число: воно випливає з ширини зони.
    </P>
    <P>Контрольна точка (Київ, 50.4501°N 30.5234°E) в UTM:</P>
    <Sample>36U 324182 5591608</Sample>
    <Illustration
      markup={utmZonesSvg}
      label="Сітка зон UTM на карті світу: 60 пронумерованих колонок по 6° довготи та смуги широти, позначені літерами від C до X"
      fullBleed
      caption={
        <>
          Уся сітка: 60 колонок по 6° довготи та смуги широти, позначені літерами <Code>C</Code>–
          <Code>X</Code> без <Code>I</Code> та <Code>O</Code>. Перетин колонки й смуги дає ту пару
          «36U», з якої починається і UTM-запис, і посилання MGRS. Помітні й винятки, яких у
          правильній сітці не мало б бути: розширена зона 32V біля Норвегії та перекроєні зони смуги
          X над Шпіцбергеном. Полярні шапки за 84° пн.ш. і 80° пд.ш. до UTM не входять — там працює
          UPS.
        </>
      }
      credit={
        <>
          Ілюстрація:{" "}
          <Link href="https://commons.wikimedia.org/wiki/File:Universal_Transverse_Mercator_zones.svg">
            Universal Transverse Mercator zones
          </Link>{" "}
          — cmglee, STyx, Wikialine, Goran tek-en, Wikimedia Commons,{" "}
          <Link href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</Link>. Змінено:
          палітру приведено до нейтральних сірих з одним акцентним кольором, лінії сітки освітлено й
          потоншено, шрифт підписів замінено на системний. Геометрія, підписи та зміст оригіналу
          збережені. Цей похідний твір поширюється на тих самих умовах — CC BY-SA 4.0.
        </>
      }
    />

    <Subheading>Пастка: літера після номера зони</Subheading>
    <P>
      <Code>17S</Code> означає дві різні речі залежно від того, кого спитати.
    </P>
    <Table
      headers={["", <Code key="t">17T</Code>, <Code key="s">17S</Code>]}
      rows={[
        ["NGA.STND.0037 — літера це смуга широти", "смуга T, 40–48°пн.ш.", "смуга S, 32–40°пн.ш."],
        ["EPSG / PROJ — літера це півкуля", "помилка, немає такої літери", "південна півкуля"],
      ]}
      caption={
        <>
          <b>NGA.STND.0037</b> — стандарт{" "}
          <Link href="https://nsgreg.nga.mil/doc/view?i=4057">
            National Geospatial-Intelligence Agency
          </Link>{" "}
          (США) «Universal Grids and Grid Reference Systems», 2014. Визначає UTM, UPS і MGRS; це
          конвенція військового картографування НАТО. <b>EPSG</b> —{" "}
          <Link href="https://epsg.org/">реєстр геодезичних параметрів</Link>, де кожна система
          координат має числовий код (наприклад <Code>EPSG:32717</Code> це «WGS 84 / UTM zone 17S»);
          його веде IOGP. <b>PROJ</b> — бібліотека перетворення координат, що спирається на цей
          реєстр і стоїть за QGIS, GDAL і PostGIS. Тобто це не два прочитання одного стандарту, а
          дві різні традиції: військова картографія проти цивільного GIS.
        </>
      }
    />
    <P>
      Смуги йдуть від <Code>C</Code> на 80°пд.ш. до <Code>X</Code> на 84°пн.ш. по 8°, без{" "}
      <Code>I</Code> та <Code>O</Code>. Смуги <Code>C</Code>–<Code>M</Code> південні, <Code>N</Code>
      –<Code>X</Code> північні. Конфлікт виникає рівно на двох літерах, і там він повний: той самий
      рядок описує точки, розділені майже дев'яноста градусами широти. Для українських даних питання
      не виникає — Україна лежить у смугах <Code>T</Code> і <Code>U</Code>.
    </P>

    <Subheading>MGRS: UTM, переписаний літерами</Subheading>
    <P>
      <Link href="https://nsgreg.nga.mil/doc/view?i=4057">NGA.STND.0037</Link> додає до зони й смуги
      квадрат 100 × 100 км, позначений парою літер, і відлік усередині цього квадрата:
    </P>
    <Sample>
      {`4Q FJ 12345 67890
^^ зона 4, смуга Q
   ^^ квадрат 100 км: стовпець F, рядок J
      ^^^^^ ^^^^^ easting і northing усередині квадрата`}
    </Sample>
    <P>
      Літери <Code>I</Code> та <Code>O</Code> не використовуються ніде — щоб не плутати з цифрами 1
      та 0. Цифр завжди парна кількість, від 0 до 10, і вони діляться навпіл. Ключове:{" "}
      <b>відкидання цифр огрублює посилання, а не зсуває його</b>.
    </P>
    <Table
      headers={["Запис", "Точність"]}
      rows={[
        [<Code key="a">4QFJ</Code>, "100 км"],
        [<Code key="b">4QFJ16</Code>, "10 км"],
        [<Code key="c">4QFJ1267</Code>, "1 км"],
        [<Code key="d">4QFJ123678</Code>, "100 м"],
        [<Code key="e">4QFJ12346789</Code>, "10 м"],
        [<Code key="f">4QFJ1234567890</Code>, "1 м"],
      ]}
    />
    <P>
      <Code>4QFJ16</Code> — це квадрат 10 км з кутом на 10000E 60000N, а не точка 1E 6N.
    </P>
    <Diagram
      viewBox="0 0 560 300"
      label="Квадрат 100 км ділиться на сто квадратів по 10 км; кожна пара доданих цифр обирає один з них, і наступна пара ділить уже його"
      caption={
        <>
          Кожна пара доданих цифр обирає один із ста квадратів усередині попереднього. Праворуч —
          той самий квадрат <Code>4QFJ16</Code>, збільшений: <Code>4QFJ1267</Code> лежить усередині
          нього, а не деінде. Тому коротший запис ніколи не суперечить довшому — він просто менш
          точний. Відлік іде на схід від лівого краю і на північ від нижнього, тож кут квадрата
          завжди південно-західний.
        </>
      }
    >
      <text x={40} y={38} fontSize={17} fontFamily="monospace" fill="currentColor">
        4QFJ16
      </text>
      <text x={40} y={54} fontSize={14} fill="currentColor" fillOpacity={0.6}>
        квадрат 100 км
      </text>
      <GridSquare x={40} y={66} side={180} column={1} row={6} />
      <text x={130} y={264} fontSize={14} textAnchor="middle" fill="currentColor" fillOpacity={0.6}>
        easting →
      </text>
      <text
        x={30}
        y={156}
        fontSize={14}
        textAnchor="middle"
        fill="currentColor"
        fillOpacity={0.6}
        transform="rotate(-90 30 156)"
      >
        northing ↑
      </text>

      {/* Both ends are derived from the same numbers GridSquare uses: the picked cell spans
          y 120..138 (square top 66 + side 180 - (row + 1) * cell), and the right square is the
          blow-up of exactly that cell. */}
      <line
        x1={76}
        y1={120}
        x2={340}
        y2={66}
        stroke={ACCENT}
        strokeOpacity={0.5}
        strokeDasharray="4 3"
      />
      <line
        x1={76}
        y1={138}
        x2={340}
        y2={246}
        stroke={ACCENT}
        strokeOpacity={0.5}
        strokeDasharray="4 3"
      />

      <text x={340} y={38} fontSize={17} fontFamily="monospace" fill="currentColor">
        4QFJ1267
      </text>
      <text x={340} y={54} fontSize={14} fill="currentColor" fillOpacity={0.6}>
        той самий, збільшений
      </text>
      <GridSquare x={340} y={66} side={180} column={2} row={7} />
      <text x={430} y={264} fontSize={14} textAnchor="middle" fill="currentColor" fillOpacity={0.6}>
        квадрат 1 км
      </text>
    </Diagram>

    <Subheading>USNG: MGRS, звужений</Subheading>
    <P>
      <Link href="https://www.fgdc.gov/standards/projects/FGDC-standards-projects/usng/fgdc_std_011_2001_usng.pdf">
        FGDC-STD-011-2001
      </Link>{" "}
      переймає сітку MGRS повністю. Відмінностей дві, і лише одна видима в рядку. Перша — датум:
      USNG стоїть на NAD 83, MGRS традиційно на WGS 84, і в рядку цього немає (саме тому FGDC
      передбачив суфікс <Code>(NAD 27)</Code>). Друга — USNG вимагає щонайменше одну цифру на вісь,
      тож голий квадрат 100 км <Code>10S GJ</Code> є валідним MGRS, але не USNG.
    </P>
    <P>
      Наслідок: <b>USNG є строгою синтаксичною підмножиною MGRS</b>. Усе, що приймає USNG, приймає й
      MGRS, а розрізнити їх за рядком неможливо — інформація, яка їх розділяє, у рядок не потрапляє.
    </P>

    <Heading>Родина третя: УСК-2000</Heading>
    <P>
      Українська система координат 2000 — державна референцна система, запроваджена{" "}
      <Link href="https://www.kmu.gov.ua/npas/9103399">постановою КМУ №1259 від 22.09.2004</Link>{" "}
      замість СК-42 і СК-63 з 1 січня 2007 року. Еліпсоїд Красовського 1940, датум{" "}
      <Link href="https://epsg.io/5561">Ukraine 2000</Link>, проєкція Гаусса-Крюгера. Запис — пара
      семизначних чисел:
    </P>
    <Sample>
      {`5591000 6325000
^^^^^^^ X: метри на північ від екватора
        ^ номер зони
         ^^^^^^ Y: easting усередині зони`}
    </Sample>
    <P>
      <b>Номер зони живе у старших цифрах Y.</b> Це видно з параметрів зонних систем:{" "}
      <Link href="https://epsg.io/5564">EPSG:5564</Link> має умовний зсув easting 6 500 000 — тобто{" "}
      <Code>номер зони × 1 000 000 + 500 000</Code>. Україна лежить між 22.15°E і 40.18°E, тобто в
      зонах <b>4, 5, 6, 7</b>. Усі однозначні, тож Y завжди має рівно сім цифр.
    </P>

    <Subheading>Чому числа схожі на UTM, але не рівні йому</Subheading>
    <P>
      І УСК-2000, і UTM — поперечна проєкція Меркатора з шестиградусними зонами, тож northing в обох
      це метри від екватора, і величини близькі. Рівними вони не бувають із трьох причин: різні
      еліпсоїди, різні датуми і — найпомітніше — <b>різний масштабний коефіцієнт</b>. УСК-2000 має
      на центральному меридіані масштаб рівно 1, UTM — 0.9996. Сама лише ця відмінність дає на
      широті Києва понад два кілометри: northing 5 591 608 при масштабі 0.9996 стає 5 593 846 при
      масштабі 1.
    </P>

    <Subheading>Нумерація зон теж різна</Subheading>
    <P>
      Зони обох систем шестиградусні й межі збігаються, але рахуються від різних місць: UTM від
      антимеридіана, Гаусса-Крюгера від Гринвіча. Наслідок —{" "}
      <b>та сама зона має номери, що відрізняються на 30</b>.
    </P>
    <Table
      headers={["", "Номер зони", "Центральний меридіан"]}
      rows={[
        ["UTM", "36", "33°E"],
        ["УСК-2000", "6", "33°E"],
      ]}
    />
    <P>
      Київ лежить у зоні 36 за UTM і в зоні 6 за УСК-2000 — це одна й та сама смуга землі. Побачивши
      обидва числа в різних джерелах, легко вирішити, що одне з них помилкове.
    </P>
    <Diagram
      viewBox="0 0 560 200"
      label="Чотири шестиградусні зони покривають Україну; межі зон і центральні меридіани в УСК-2000 та UTM збігаються, а номери відрізняються на тридцять"
      caption={
        <>
          Межі зон і центральні меридіани в обох системах ті самі — різняться лише номери, рівно на
          30. Київ на 30.52°E потрапляє в зону відразу за межею 30°, тож у наших даних вона зветься
          шостою, а в міжнародних тридцять шостою. Це одна й та сама смуга землі.
        </>
      }
    >
      {[
        { x: 40, ucs: "4", utm: "34", cm: "21°E" },
        { x: 160, ucs: "5", utm: "35", cm: "27°E" },
        { x: 280, ucs: "6", utm: "36", cm: "33°E" },
        { x: 400, ucs: "7", utm: "37", cm: "39°E" },
      ].map((zone) => (
        <g key={zone.ucs}>
          <rect
            x={zone.x}
            y={52}
            width={120}
            height={52}
            fill={zone.ucs === "6" ? ACCENT : "none"}
            fillOpacity={zone.ucs === "6" ? 0.14 : 0}
            stroke="currentColor"
            strokeOpacity={0.6}
          />
          <text x={zone.x + 60} y={72} fontSize={15} textAnchor="middle" fill="currentColor">
            УСК-2000 · {zone.ucs}
          </text>
          <text
            x={zone.x + 60}
            y={92}
            fontSize={15}
            textAnchor="middle"
            fill="currentColor"
            fillOpacity={0.6}
          >
            UTM · {zone.utm}
          </text>
          <line
            x1={zone.x + 60}
            y1={104}
            x2={zone.x + 60}
            y2={118}
            stroke="currentColor"
            strokeOpacity={0.5}
            strokeDasharray="3 3"
          />
          <text
            x={zone.x + 60}
            y={132}
            fontSize={14}
            textAnchor="middle"
            fill="currentColor"
            fillOpacity={0.6}
          >
            {zone.cm}
          </text>
        </g>
      ))}

      <text x={40} y={40} fontSize={14} fill="currentColor" fillOpacity={0.6}>
        18°E
      </text>
      <text x={520} y={40} fontSize={14} textAnchor="end" fill="currentColor" fillOpacity={0.6}>
        42°E
      </text>

      <circle cx={290} cy={52} r={4} fill={ACCENT} />
      <text x={290} y={40} fontSize={14} textAnchor="middle" fill={ACCENT}>
        Київ 30.52°E
      </text>

      <line x1={123} y1={158} x2={484} y2={158} stroke="currentColor" strokeOpacity={0.6} />
      <line x1={123} y1={152} x2={123} y2={164} stroke="currentColor" strokeOpacity={0.6} />
      <line x1={484} y1={152} x2={484} y2={164} stroke="currentColor" strokeOpacity={0.6} />
      <text x={303} y={180} fontSize={14} textAnchor="middle" fill="currentColor" fillOpacity={0.6}>
        Україна, 22.15°–40.18°E
      </text>
    </Diagram>

    <Heading>Одна точка в усіх записах</Heading>
    <P>Київ, 50.4501°N 30.5234°E:</P>
    <Table
      headers={["Формат", "Запис"]}
      rows={[
        ["WGS84", <Code key="a">50.4501, 30.5234</Code>],
        ["DD", <Code key="b">50.4501°N, 30.5234°E</Code>],
        ["DDM", <Code key="c">50° 27.006'N, 30° 31.404'E</Code>],
        ["DMS", <Code key="d">50° 27' 0.36"N, 30° 31' 24.24"E</Code>],
        ["UTM", <Code key="e">36U 324182 5591608</Code>],
      ]}
    />
    <Subheading>Чому перші чотири рядки дістаються задарма, а решта ні</Subheading>
    <P>
      DD, DDM і DMS — це та сама широта й довгота, лише інакше записана. Перехід між ними це
      множення й ділення на 60, без жодних припущень: та сама точка, той самий датум, ніякої
      проєкції. Тому перші чотири рядки точні за побудовою.
    </P>
    <P>
      UTM уже потребує проєкції — розгортання еліпсоїда на площину — але{" "}
      <b>датум лишається той самий</b>, WGS 84. Тож значення визначається однозначно й піддається
      перевірці, що ми й зробили: меридіанна чверть WGS84 збігається з довідковим значенням 10 001
      965.729 м з точністю 0.5 мм, а мінімальний easting на екваторі дає рівно 166 021 м.
    </P>
    <P>
      <b>MGRS</b> іде на крок далі за UTM. Зона й смуга в нього ті самі, але замість повних easting
      і northing він називає квадрат 100 × 100 км парою літер і відлічує вже всередині цього
      квадрата. Літери беруться з таблиці, яка повторюється з періодом, залежним від номера зони, а
      історично залежала ще й від датума. Підступність тут ось у чому: помилка в цій таблиці не
      робить посилання явно зіпсованим — вона зсуває точку рівно на 100 км або кратно тому, і
      результат далі виглядає як цілком валідний MGRS. Неправильну відповідь неможливо впізнати на
      око.
    </P>
    <P>
      <b>УСК-2000</b> упирається в інше. Її числа неможливо дістати з наших 50.4501°N 30.5234°E
      самою лише проєкцією, бо УСК-2000 стоїть на іншому датумі — Ukraine 2000 з еліпсоїдом
      Красовського, а не WGS 84. Спершу треба перевести саму пару широта/довгота з одного датума в
      інший, а це перетворення Гельмерта з семи параметрів: три зсуви, три повороти й масштаб.
      Параметри публікуються для конкретних регіонів, і взяти приблизні означає промахнутися на
      метри або десятки метрів. Лише після цього можна проєктувати.
    </P>
    <P>
      Обидва випадки — це <b>конвертація</b>, а не парсинг, і ця бібліотека її не робить (про
      різницю — наступний розділ). Поставити сюди правдоподібні числа означало б видати за
      перевірений факт те, чого ми не рахували. Якщо ці значення потрібні на практиці, їх дає{" "}
      <Link href="https://proj.org/">PROJ</Link> — а через нього QGIS, GDAL і PostGIS — або{" "}
      <Link href="https://github.com/chrisveness/geodesy">geodesy</Link> Кріса Венесса для MGRS.
    </P>

    <Heading>Парсинг та конвертація — різні задачі</Heading>
    <P>
      Ця бібліотека <b>парсить</b> координати: перетворює рядок на структуру, перевіряє діапазони,
      називає формат. Вона не <b>конвертує</b> між системами. Парсинг{" "}
      <Code>36U 324182 5591608</Code> дає зону, смугу, easting і northing — це просто читання.
      Перетворення цього на широту й довготу вимагає зворотної проєкції, а перетворення в УСК-2000 —
      ще й зсуву датума.
    </P>
    <P>
      Тому парсери сітьових систем повертають структуру, а парсери родини широта/довгота — саме пару
      чисел: там перетворення це арифметика, а не проєкція.
    </P>

    <Heading>Пастки, зібрані на практиці</Heading>
    <ol className="mt-2 flex list-decimal flex-col gap-1 pl-5">
      <li>
        <b>Порядок у знаковому записі невідновний.</b> <Code>30.5234, 50.4501</Code> однаково
        валідний в обох прочитаннях.
      </li>
      <li>
        <b>USNG неможливо відрізнити від MGRS за рядком.</b> Підмножина, а не альтернатива.
      </li>
      <li>
        <b>
          <Code>17S</Code> означає протилежні півкулі
        </b>{" "}
        за NGA та за EPSG.
      </li>
      <li>
        <b>
          <Code>50,4501 30,5234</Code>
        </b>{" "}
        — кома тут десятковий знак, а не роздільник. Парсер, який цього не передбачає, прочитає
        чотири числа замість двох.
      </li>
      <li>
        <b>Номер зони в УСК-2000 захований у Y.</b> Хто цього не знає, побачить просто велике число.
      </li>
      <li>
        <b>Відкидання цифр у MGRS огрублює, а не зсуває.</b> <Code>4QFJ16</Code> — це квадрат, а не
        точка.
      </li>
      <li>
        <b>60 хвилин і 60 секунд не існує.</b> Це вже наступний градус чи хвилина. Регексп, який
        дозволяє <Code>|60</Code>, пропускає невалідні координати.
      </li>
    </ol>
  </article>
);
