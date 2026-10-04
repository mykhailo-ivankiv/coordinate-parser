import { Fragment, type ReactNode, useState } from "react";
import { parse } from "sugar-high/core";
import { tokenize } from "sugar-high/lang/typescript";
import docs from "virtual:api-docs";
import type { ApiEntry } from "./apiDocsModel.ts";
import { useActiveSection } from "./useActiveSection.ts";

// The API reference, laid out the way ramda, lodash and date-fns lay theirs out: a filterable list
// of every name on the left, and per entry its signature, description, arguments, return value,
// errors and examples. Nothing here is written by hand except the headings — entries, signatures
// and prose come from TypeDoc reading the two packages at build time (see apiDocs/), and the
// examples are run by apiDocs/examples.test.ts. The prose is the code's own JSDoc, so it is English.

const SOURCE_BASE = "https://github.com/mykhailo-ivankiv/coordinate-toolkit/blob/master/";

const MODULES: {
  id: ApiEntry["module"];
  title: string;
  /** What a caller writes to use the package; the names are the ones its examples lean on. */
  importLine: string;
  /** A module with a single group lists its entries straight under the module, without a title. */
  groups: { id: ApiEntry["group"]; title?: string }[];
}[] = [
  {
    id: "types",
    title: "Типи",
    importLine: `import type { Coordinate, CoordinateSystem } from "@coordinate-toolkit/types";`,
    groups: [{ id: "types" }],
  },
  {
    id: "parser",
    title: "Парсер",
    importLine: `import { coordinateParser, mgrsParser } from "@coordinate-toolkit/parser";`,
    groups: [{ id: "parsers" }],
  },
  {
    id: "converter",
    title: "Конвертер",
    importLine: `import { fromWgs84ToMgrs, fromMgrsToWgs84 } from "@coordinate-toolkit/converter";`,
    groups: [
      { id: "MGRS", title: "MGRS" },
      { id: "USNG", title: "USNG" },
      { id: "UTM", title: "UTM" },
      { id: "UCS-2000", title: "УСК-2000" },
    ],
  },
  {
    id: "formatter",
    title: "Форматер",
    importLine: `import { format, formatWgs84dms } from "@coordinate-toolkit/formatter";`,
    groups: [{ id: "functions" }],
  },
];

const entriesOf = (module: ApiEntry["module"], group: ApiEntry["group"]) =>
  docs.entries.filter((entry) => entry.module === module && entry.group === group);

const NAMES = new Set(docs.entries.map(({ name }) => name));

// Everything the contents can point at, in page order, for the highlight that follows the reading.
const SECTION_IDS = MODULES.flatMap((module) => [
  module.id,
  ...module.groups.flatMap((group) => entriesOf(module.id, group.id).map(({ name }) => name)),
]);

const LINK = "underline decoration-line-strong underline-offset-2 hover:decoration-current";

// The app keeps its pages in the URL hash, so a plain "#name" anchor would read as a page; this
// scrolls to the entry instead and leaves the URL alone, as the guide's contents do.
const EntryLink = ({
  name,
  className = LINK,
  children,
}: {
  name: string;
  className?: string;
  children?: ReactNode;
}) => (
  <a
    href="#/api"
    className={className}
    onClick={(event) => {
      event.preventDefault();
      document.getElementById(name)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }}
  >
    {children ?? name}
  </a>
);

// Only the TypeScript tokenizer: the "sugar-high/lang" index would bring every language along.
const TYPESCRIPT = { tokenize };

// TypeScript, coloured by sugar-high's tokenizer and rendered as React rather than an HTML string,
// so that a documented name inside the code stays a link to its entry. Colours: index.css, .sh-*.
// `self` is the entry the code belongs to: its own name is not linked to where the reader already is.
const Code = ({ children, self }: { children: string; self?: string }) => (
  <pre>
    <code>
      {parse(children, TYPESCRIPT).lines.map((line) => (
        <Fragment key={line.index}>
          {line.index > 0 && "\n"}
          {line.tokens.map((token, index) => (
            <span key={index} className={`sh-${token.type}`}>
              {token.type !== "comment" &&
              token.type !== "string" &&
              token.value !== self &&
              NAMES.has(token.value) ? (
                <EntryLink name={token.value} />
              ) : (
                token.value
              )}
            </span>
          ))}
        </Fragment>
      ))}
    </code>
  </pre>
);

// JSDoc prose: single line breaks are only source wrapping, and backticks mark code — a documented
// name in backticks becomes a link to its entry.
const InlineProse = ({ children }: { children: string }) =>
  children
    .replace(/\s*\n\s*/g, " ")
    .split(/(`[^`]+`)/)
    .map((part, index) => {
      if (!part.startsWith("`")) return <Fragment key={index}>{part}</Fragment>;
      const code = part.slice(1, -1);
      return <code key={index}>{NAMES.has(code) ? <EntryLink name={code} /> : code}</code>;
    });

// Blank lines part paragraphs.
const Prose = ({ children }: { children: string }) =>
  children
    .split(/\n\s*\n/)
    .filter((paragraph) => paragraph.trim() !== "")
    .map((paragraph, index) => (
      <p key={index}>
        <InlineProse>{paragraph}</InlineProse>
      </p>
    ));

// A type in a table cell: TypeScript's text, with every documented name in it a link.
const TypeText = ({ children }: { children: string }) => (
  <code>
    {children
      .split(/(\b[A-Za-z_]\w*\b)/)
      .map((part, index) =>
        NAMES.has(part) ? (
          <EntryLink key={index} name={part} />
        ) : (
          <Fragment key={index}>{part}</Fragment>
        ),
      )}
  </code>
);

// Past this, a signature puts one parameter per line, the way a formatter would.
const MAX_SIGNATURE = 64;

const signatureOf = (entry: ApiEntry): string | null => {
  if (entry.kind === "variable") return `const ${entry.name}: ${entry.type ?? "unknown"}`;
  if (entry.kind === "type") {
    return entry.type === undefined ? null : `type ${entry.name} = ${entry.type}`;
  }
  return entry.signatures
    .map(({ parameters, returns }) => {
      const written = parameters.map(
        ({ name, optional, type }) => `${name}${optional ? "?" : ""}: ${type}`,
      );
      const flat = `${entry.name}(${written.join(", ")}): ${returns}`;
      return flat.length <= MAX_SIGNATURE
        ? flat
        : `${entry.name}(\n${written.map((parameter) => `  ${parameter},`).join("\n")}\n): ${returns}`;
    })
    .join("\n");
};

/** One labelled part of an entry — Аргументи, Повертає and so on — as date-fns splits them. */
const Part = ({ title, children }: { title: string; children: ReactNode }) => (
  <>
    <p className="mb-1! text-xs font-bold tracking-wide uppercase opacity-60">{title}</p>
    {children}
  </>
);

// Rows of name, type and description, for arguments, fields and the like.
const Rows = ({
  rows,
}: {
  rows: { key: string; name?: ReactNode; type: ReactNode; description: string }[];
}) => (
  <table className="mt-0!">
    <tbody>
      {rows.map(({ key, name, type, description }) => (
        <tr key={key}>
          {name !== undefined && <td className="whitespace-nowrap">{name}</td>}
          <td>{type}</td>
          <td>
            <InlineProse>{description}</InlineProse>
          </td>
        </tr>
      ))}
    </tbody>
  </table>
);

const Signature = ({ entry }: { entry: ApiEntry }) => {
  const signature = signatureOf(entry);
  return signature && <Code self={entry.name}>{signature}</Code>;
};

const Entry = ({ entry }: { entry: ApiEntry }) => (
  <section id={entry.name} className="scroll-mt-16 border-t pt-6 lg:scroll-mt-6">
    <h4 className="mt-0! flex flex-wrap items-baseline justify-between gap-x-3">
      <code className="text-lg">{entry.name}</code>
      <a
        href={`${SOURCE_BASE}${entry.source.file}#L${entry.source.line}`}
        target="_blank"
        rel="noreferrer"
        className="font-mono text-xs font-normal opacity-60 hover:opacity-100"
      >
        {entry.source.file}:{entry.source.line}
      </a>
    </h4>
    <Signature entry={entry} />
    <Prose>{entry.summary}</Prose>
    {entry.signatures.map((signature, index) => (
      <Fragment key={index}>
        {signature.parameters.length > 0 && (
          <Part title="Аргументи">
            <Rows
              rows={signature.parameters.map((parameter) => ({
                key: parameter.name,
                name: (
                  <code>
                    {parameter.name}
                    {parameter.optional && "?"}
                  </code>
                ),
                type: <TypeText>{parameter.type}</TypeText>,
                description: parameter.description,
              }))}
            />
          </Part>
        )}
        <Part title="Повертає">
          <Rows
            rows={[
              {
                key: "returns",
                type: <TypeText>{signature.returns}</TypeText>,
                description: signature.returnsDescription,
              },
            ]}
          />
        </Part>
      </Fragment>
    ))}
    {entry.properties.length > 0 && (
      <Part title="Поля">
        <Rows
          rows={entry.properties.map((property) => ({
            key: property.name,
            name: (
              <code>
                {property.name}
                {property.optional && "?"}
              </code>
            ),
            type: <TypeText>{property.type}</TypeText>,
            description: property.description,
          }))}
        />
      </Part>
    )}
    {entry.throws.length > 0 && (
      <Part title="Кидає">
        <Rows
          rows={entry.throws.map((thrown, index) => ({
            key: String(index),
            type: <code>{thrown.error}</code>,
            description: thrown.description,
          }))}
        />
      </Part>
    )}
    {entry.examples.length > 0 && (
      <Part title="Приклад">
        {entry.examples.map((example, index) => (
          <Code key={index}>{example}</Code>
        ))}
      </Part>
    )}
  </section>
);

/**
 * The list of every name, with a filter on top, as ramda and lodash have it. Modules, then groups,
 * then entries; a group the filter empties disappears.
 */
const Contents = ({ active, className = "" }: { active?: string; className?: string }) => {
  const [query, setQuery] = useState("");
  const matches = (name: string) => name.toLowerCase().includes(query.trim().toLowerCase());
  const modules = MODULES.map((module) => ({
    ...module,
    groups: module.groups
      .map((group) => ({
        ...group,
        names: entriesOf(module.id, group.id)
          .map(({ name }) => name)
          .filter(matches),
      }))
      .filter((group) => group.names.length > 0),
  })).filter((module) => module.groups.length > 0);

  return (
    <nav aria-label="Зміст API" className={`text-sm ${className}`}>
      <input
        type="search"
        className="field mb-4 h-9! w-full text-sm"
        placeholder="Пошук"
        aria-label="Пошук у API"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      {modules.length === 0 && <p className="text-xs opacity-60">Нічого не знайдено</p>}
      {modules.map((module) => (
        <div key={module.id} className="mb-4">
          <EntryLink name={module.id} className="font-bold hover:opacity-70">
            {module.title}
          </EntryLink>
          {module.groups.map((group) => (
            <div key={group.id} className="mt-2">
              {group.title && <p className="mb-1 text-xs opacity-60">{group.title}</p>}
              <ul className="flex flex-col border-l border-line font-mono text-xs">
                {group.names.map((name) => (
                  <li key={name}>
                    <EntryLink
                      name={name}
                      className={`-ml-px block truncate border-l-2 py-0.5 pl-3 ${
                        name === active
                          ? "border-ink font-bold"
                          : "border-transparent opacity-60 hover:opacity-100"
                      }`}
                    />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ))}
    </nav>
  );
};

const Sidebar = () => <Contents active={useActiveSection(SECTION_IDS)} />;

/**
 * The page's two columns, for App to place in its grid: the list beside the reference on wide
 * screens, and above it, without the reading highlight, on narrow ones.
 */
export const ApiPage = ({ header }: { header: ReactNode }) => (
  <>
    <aside className="hidden w-56 justify-self-end lg:block">
      <div className="sticky top-6 max-h-[calc(100vh-3rem)] overflow-y-auto pr-1">
        <Sidebar />
      </div>
    </aside>
    <div className="m-auto min-w-0 max-w-[64ch] lg:m-0">
      {header}
      <Contents className="card mb-6 p-4 lg:hidden" />
      <article className="prose prose-sm prose-ink max-w-none">
        {MODULES.map((module) => (
          <Fragment key={module.id}>
            <h2 id={module.id} className="scroll-mt-16 lg:scroll-mt-6">
              {module.title}
            </h2>
            <Code>{module.importLine}</Code>
            {module.groups
              .filter((group) => entriesOf(module.id, group.id).length > 0)
              .map((group) => (
                <Fragment key={group.id}>
                  {group.title && <h3>{group.title}</h3>}
                  {entriesOf(module.id, group.id).map((entry) => (
                    <Entry key={entry.name} entry={entry} />
                  ))}
                </Fragment>
              ))}
          </Fragment>
        ))}
      </article>
    </div>
  </>
);
