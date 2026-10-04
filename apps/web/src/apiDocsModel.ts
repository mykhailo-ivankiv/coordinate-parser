// The shape of the API reference, as apiDocs/extract.ts distils it from TypeDoc and the API page
// renders it. Types arrive as strings, already printed the way TypeScript would write them.
//
// Prose fields are TSDoc text: paragraphs separated by blank lines, `inline code` in backticks, and
// {@link Name} references already reduced to `Name`.

import type { CoordinateSystem } from "@coordinate-parser/types";

export type ApiParameter = {
  name: string;
  type: string;
  optional: boolean;
  defaultValue?: string;
  /** From the function's @param tag. */
  description: string;
};

export type ApiProperty = {
  name: string;
  type: string;
  optional: boolean;
  description: string;
};

export type ApiEntry = {
  name: string;
  kind: "function" | "variable" | "type";
  /** Which package declares it. */
  module: "types" | "parser" | "converter" | "formatter";
  /**
   * Where the page lists it: by what it is — a parser object, a function, a constant or a type —
   * unless its JSDoc names a coordinate system with `@group`, as the converter's functions do.
   */
  group: "parsers" | "functions" | "constants" | "types" | CoordinateSystem;
  summary: string;
  /** Function signatures, one per overload. */
  signatures: {
    parameters: ApiParameter[];
    returns: string;
    /** From the @returns tag. */
    returnsDescription: string;
  }[];
  /** A variable's type, or a type alias's definition when it is not a plain object type. */
  type?: string;
  /** The documented fields of an object type, its own and those of any type literal it joins. */
  properties: ApiProperty[];
  /** Each @throws tag: the error's name, its first word, and when it is thrown. */
  throws: { error: string; description: string }[];
  /** The code of each @example block, without the fences. */
  examples: string[];
  /** Where the declaration lives, relative to the repository root. */
  source: { file: string; line: number };
};

export type ApiDocs = { entries: ApiEntry[] };
