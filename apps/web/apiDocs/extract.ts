import { resolve } from "node:path";
import {
  Application,
  type Comment,
  type CommentDisplayPart,
  type DeclarationReflection,
  ReflectionKind,
  type SomeType,
} from "typedoc";
import type { ApiDocs, ApiEntry, ApiProperty } from "../src/apiDocsModel.ts";

// The API reference is generated, never written: TypeDoc reads each package's entry point — its
// public surface — and this file keeps what the page shows. Signatures and types come from the compiler and prose from
// JSDoc, so the page cannot describe a function that no longer exists or a parameter it lost.

const ROOT = resolve(import.meta.dirname, "../../..");
// Each documented package, by the module name TypeDoc gives it — its package.json name — and the
// directory it lives in.
const PACKAGES: Record<string, { module: ApiEntry["module"]; directory: string }> = {
  "@coordinate-parser/parser": { module: "parser", directory: "packages/parser" },
  "@coordinate-parser/converter": { module: "converter", directory: "packages/converter" },
};

const text = (parts: readonly CommentDisplayPart[] = []) =>
  parts
    .map((part) => (part.kind === "inline-tag" ? `\`${part.text}\`` : part.text))
    .join("")
    .trim();

const blockTags = (comment: Comment | undefined, tag: `@${string}`) =>
  (comment?.blockTags ?? [])
    .filter((block) => block.tag === tag)
    .map((block) => text(block.content));

// TypeDoc keeps an @example's fences; the page and the example test want only the code.
const code = (example: string) => example.replace(/^```\w*\n?/, "").replace(/\n?```$/, "");

const typeText = (type: SomeType | undefined) => type?.toString() ?? "unknown";

const property = (child: DeclarationReflection): ApiProperty => ({
  name: child.name,
  type: typeText(child.type),
  optional: child.flags.isOptional,
  description: text(child.comment?.summary),
});

// An object type's fields, wherever TypeDoc put them: as the alias's own children for a plain type
// literal, or inside the literal half of an intersection such as `GridLocation & { zone: number }`.
const propertiesOf = (reflection: DeclarationReflection): ApiProperty[] => {
  if (reflection.children) return reflection.children.map(property);
  if (reflection.type?.type !== "intersection") return [];
  return reflection.type.types.flatMap((member) =>
    member.type === "reflection" ? (member.declaration.children ?? []).map(property) : [],
  );
};

// The parsers are exported as arcsecond Parser objects, not functions, but they are what a caller
// calls; any variable whose type holds a Parser gets a group of its own rather than passing for a
// constant.
const groupOf = (reflection: DeclarationReflection): ApiEntry["group"] => {
  if (reflection.kind === ReflectionKind.TypeAlias) return "types";
  if (reflection.kind === ReflectionKind.Function) return "functions";
  return /\bParser</.test(typeText(reflection.type)) ? "parsers" : "constants";
};

const entry = (
  reflection: DeclarationReflection,
  { module, directory }: (typeof PACKAGES)[string],
): ApiEntry => {
  const signatures = reflection.signatures ?? [];
  // A function's documentation sits on its signature, everything else's on the declaration.
  const comment = reflection.comment ?? signatures[0]?.comment;
  const kind =
    reflection.kind === ReflectionKind.Function
      ? "function"
      : reflection.kind === ReflectionKind.TypeAlias
        ? "type"
        : "variable";
  const declared = reflection.sources?.[0];

  return {
    name: reflection.name,
    kind,
    module,
    group: groupOf(reflection),
    summary: text(comment?.summary),
    signatures: signatures.map((signature) => ({
      parameters: (signature.parameters ?? []).map((parameter) => ({
        name: parameter.name,
        type: typeText(parameter.type),
        optional: parameter.flags.isOptional || parameter.defaultValue !== undefined,
        defaultValue: parameter.defaultValue,
        // TypeDoc keeps the dash that separates a TSDoc @param name from its description.
        description: text(parameter.comment?.summary).replace(/^-\s*/, ""),
      })),
      returns: typeText(signature.type),
      returnsDescription: blockTags(signature.comment, "@returns")[0] ?? "",
    })),
    // A plain object type is shown by its fields alone; anything else needs its definition.
    type: kind === "function" || reflection.children ? undefined : typeText(reflection.type),
    properties: kind === "type" ? propertiesOf(reflection) : [],
    throws: blockTags(comment, "@throws").map((thrown) => {
      const [error = "", ...description] = thrown.split(/\s+/);
      return { error, description: description.join(" ") };
    }),
    examples: blockTags(comment, "@example").map(code),
    source: {
      // In packages mode TypeDoc gives each source relative to its package's src directory.
      file: declared ? `${directory}/src/${declared.fileName}` : "",
      line: declared?.line ?? 0,
    },
  };
};

export const extractApiDocs = async (): Promise<ApiDocs> => {
  const app = await Application.bootstrap({
    // One module per package, each read with its own tsconfig from the entry its package.json exports.
    entryPointStrategy: "packages",
    entryPoints: Object.values(PACKAGES).map(({ directory }) => resolve(ROOT, directory)),
    logLevel: "Warn",
  });
  const project = await app.convert();
  // TypeDoc refuses a project that does not type-check, and says why only in its log.
  if (!project)
    throw new Error("TypeDoc could not convert the packages; run `tsc -b` for the errors");
  const entries = (project.children ?? []).flatMap((module) => {
    const known = PACKAGES[module.name];
    if (!known) throw new Error(`TypeDoc reported an unknown package, ${module.name}`);
    return (module.children ?? []).map((reflection) => entry(reflection, known));
  });
  // Packages mode sorts alphabetically; the page reads better in the order the code is written.
  const position = ({ source }: ApiEntry) =>
    `${source.file}:${String(source.line).padStart(6, "0")}`;
  return { entries: entries.sort((a, b) => position(a).localeCompare(position(b))) };
};
