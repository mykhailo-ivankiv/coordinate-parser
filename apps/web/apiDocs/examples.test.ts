import { describe, expect, test } from "vitest";
import * as converter from "@coordinate-parser/converter";
import * as formatter from "@coordinate-parser/formatter";
import * as parser from "@coordinate-parser/parser";
import { extractApiDocs } from "./extract.ts";

// Keeps the generated API page honest. Signatures cannot drift, since they come from the compiler,
// but prose and examples are written by hand; this runs every @example against the real exports
// and fails on an export nobody described.
//
// An example is a sequence of expressions, each followed by a comment saying what it gives:
//
//   fromWGS84(point, "MGRS", { precision: 1000 }).value
//   // → "36UUA2491"
//   fromWGS84({ latitude: 89, longitude: 0 }, "UTM")
//   // throws RangeError
//
// Both sides are evaluated as JavaScript with every export of both packages in scope, and compared by
// value, so an example has to be plain JavaScript, not TypeScript.

const docs = await extractApiDocs();

const api = { ...parser, ...converter, ...formatter };
const names = Object.keys(api);
const values = Object.values(api);
const evaluate = (expression: string): unknown =>
  // oxlint-disable-next-line no-new-func -- the examples are this repository's own source
  new Function(...names, `return (${expression});`)(...values);

type Check = { expression: string; expected: string } | { expression: string; throws: string };

const checksOf = (example: string): Check[] => {
  const checks: Check[] = [];
  let pending: string[] = [];
  for (const line of example.split("\n")) {
    const result = line.match(/^\s*\/\/ → (.*)$/);
    const thrown = line.match(/^\s*\/\/ throws (\w+)/);
    if (result || thrown) {
      const expression = pending.join("\n");
      pending = [];
      checks.push(
        result ? { expression, expected: result[1] } : { expression, throws: thrown![1] },
      );
    } else if (line.trim() !== "") {
      pending.push(line);
    }
  }
  if (pending.length > 0) throw new Error(`Example ends without a result: ${pending.join("\n")}`);
  return checks;
};

describe("API reference", () => {
  test.each(docs.entries.map((entry) => [entry.name, entry] as const))(
    "%s is documented",
    (_, entry) => {
      expect(entry.summary).not.toBe("");
      for (const signature of entry.signatures) {
        for (const parameter of signature.parameters) {
          expect(parameter.description, `@param ${parameter.name}`).not.toBe("");
        }
        expect(signature.returnsDescription, "@returns").not.toBe("");
      }
    },
  );

  const examples = docs.entries.flatMap((entry) =>
    entry.examples.flatMap((example) =>
      checksOf(example).map((check) => [entry.name, check.expression, check] as const),
    ),
  );

  test.each(examples)("%s: %s", (_, __, check) => {
    if ("throws" in check) {
      const ErrorType = (globalThis as Record<string, unknown>)[check.throws];
      expect(() => evaluate(check.expression)).toThrow(ErrorType as ErrorConstructor);
    } else {
      expect(evaluate(check.expression)).toEqual(evaluate(check.expected));
    }
  });
});
