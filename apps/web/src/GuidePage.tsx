import {
  ArticleAboutCoordinateSystems,
  GuideContentsBar,
  GuideContentsSidebar,
} from "./ArticleAboutCoordinateSystems.tsx";
import { PageHeader } from "./PageHeader.tsx";

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

// The guide is a long read: on wide screens its contents stay in a column to the left, on narrow
// ones they fold into a bar at the top. The article keeps the same reading width either way.
// Equal flexible tracks on both sides keep the article in the middle of the screen, with the
// contents hugging it from the left; once the left track hits its 14rem minimum, the right one
// gives way and the article drifts right rather than squeezing the contents.
export const GuidePage = () => (
  <main className="m-auto px-4 py-6 lg:grid lg:grid-cols-[minmax(14rem,1fr)_minmax(0,64ch)_minmax(0,1fr)] lg:gap-x-12">
    <aside className="hidden w-56 justify-self-end lg:block">
      <div className="sticky top-6 max-h-[calc(100vh-3rem)] overflow-y-auto">
        <GuideContentsSidebar />
      </div>
    </aside>
    <div className="m-auto min-w-0 max-w-[64ch] lg:m-0">
      <PageHeader
        title="Довідник"
        subtitle="Системи координат, датуми й формати запису: як вони влаштовані й де чекають пастки."
      />
      <GuideContentsBar className="lg:hidden" />
      <ArticleAboutCoordinateSystems />
      <section className="mt-12">
        <ReferenceList title="Матеріали" items={reading} />
        <ReferenceList title="Першоджерела" items={sources} />
      </section>
    </div>
  </main>
);
