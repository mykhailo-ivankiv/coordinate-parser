import { relative, resolve } from "node:path";
import {
  Application,
  type Comment,
  type CommentDisplayPart,
  type DeclarationReflection,
  ReflectionKind,
  type SomeType,
} from "typedoc";
import type { ApiDocs, ApiEntry, ApiProperty } from "../src/apiDocsModel.ts";

// The API reference is generated, never written: TypeDoc reads src/api.ts — the public surface — and
// this file keeps what the page shows. Signatures and types come from the compiler and prose from
// JSDoc, so the page cannot describe a function that no longer exists or a parameter it lost.

const ROOT = resolve(import.meta.dirname, "..");
const ENTRY_POINT = resolve(ROOT, "src/api.ts");

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
  const type = reflection.type;
  if (type?.type !== "intersection") return [];
  return type.types.flatMap((member) =>
    member.type === "reflection" ? (member.declaration.children ?? []).map(property) : [],
  );
};

// The parsers are exported as arcsecond Parser objects, not functions, but they are what a caller
// calls; they get a group of their own rather than passing for constants.
const groupOf = (
  reflection: DeclarationReflection,
  module: ApiEntry["module"],
): ApiEntry["group"] => {
  if (reflection.kind === ReflectionKind.TypeAlias) return "types";
  if (reflection.kind === ReflectionKind.Function) return "functions";
  return module === "parser" ? "parsers" : "constants";
};

const entry = (reflection: DeclarationReflection): ApiEntry => {
  const signatures = reflection.signatures ?? [];
  // A function's documentation sits on its signature, everything else's on the declaration.
  const comment = reflection.comment ?? signatures[0]?.comment;
  const declared = reflection.sources?.[0];
  const file = declared ? relative(ROOT, declared.fullFileName) : "";
  const kind =
    reflection.kind === ReflectionKind.Function
      ? "function"
      : reflection.kind === ReflectionKind.TypeAlias
        ? "type"
        : "variable";
  const properties = kind === "type" ? propertiesOf(reflection) : [];
  const module = file.startsWith("src/parsers/") ? "parser" : "converter";

  return {
    name: reflection.name,
    kind,
    module,
    group: groupOf(reflection, module),
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
    properties,
    throws: blockTags(comment, "@throws").map((thrown) => {
      const [error = "", ...description] = thrown.split(/\s+/);
      return { error, description: description.join(" ") };
    }),
    examples: blockTags(comment, "@example").map(code),
    source: { file, line: declared?.line ?? 0 },
  };
};

export const extractApiDocs = async (): Promise<ApiDocs> => {
  const app = await Application.bootstrap({
    entryPoints: [ENTRY_POINT],
    tsconfig: resolve(ROOT, "tsconfig.app.json"),
    sort: ["source-order"],
    logLevel: "Warn",
  });
  const project = await app.convert();
  // TypeDoc refuses a project that does not type-check, and says why only in its log.
  if (!project)
    throw new Error("TypeDoc could not convert src/api.ts; run `tsc -b` for the errors");
  return { entries: (project.children ?? []).map(entry) };
};
