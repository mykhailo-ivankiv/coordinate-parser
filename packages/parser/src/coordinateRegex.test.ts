import type { Parser } from "arcsecond";
import { describe, expect, it } from "vitest";
import { WGS84, WGS84R } from "./coordinateRegex.ts";
import { WGS84parser } from "./WGS84parser.ts";
import { WGS84Rparser } from "./WGS84Rparser.ts";

// The regexes are the baseline specification, so these are differential tests: every input
// is judged twice, once by the regex and once by the parser, and both verdicts are pinned.
// Rows where the two disagree are the point of the suite — see the two summary tests at the
// bottom of each block, which freeze exactly which disagreements are currently tolerated.

type Case = { input: string; byRegex: boolean; byParser: boolean };

const accepts = <T>(parser: Parser<T>, input: string) => !parser.run(input).isError;

const conformance = <T>(
  name: string,
  regex: RegExp,
  parser: Parser<T>,
  cases: Case[],
  // Regex accepts, parser rejects. Every entry is a hole in the parser's coverage.
  gaps: string[],
  // Parser accepts, regex rejects. Deliberate leniency about formatting, not about values.
  supersets: string[],
) =>
  describe(name, () => {
    it.each(cases.map(({ input, byRegex, byParser }) => [input, byRegex, byParser] as const))(
      "%j — regex %s, parser %s",
      (input, byRegex, byParser) => {
        expect(regex.test(input)).toBe(byRegex);
        expect(accepts(parser, input)).toBe(byParser);
      },
    );

    it("the parser covers the regex, apart from the frozen gaps", () => {
      const found = cases.filter(({ byRegex, byParser }) => byRegex && !byParser);
      expect(found.map(({ input }) => input)).toEqual(gaps);
    });

    it("the parser is more permissive only where intended", () => {
      const found = cases.filter(({ byRegex, byParser }) => !byRegex && byParser);
      expect(found.map(({ input }) => input)).toEqual(supersets);
    });
  });

const wgs84Cases: Case[] = [
  // Agreed: valid.
  { input: "50.4501, 30.5234", byRegex: true, byParser: true },
  { input: "50.4501 30.5234", byRegex: true, byParser: true },
  { input: "0 0", byRegex: true, byParser: true },
  { input: "90 0", byRegex: true, byParser: true },
  { input: "-90 0", byRegex: true, byParser: true },
  { input: "0 180", byRegex: true, byParser: true },
  { input: "0 -180", byRegex: true, byParser: true },
  { input: "+50 +30", byRegex: true, byParser: true },
  { input: "-50.5 -30.5", byRegex: true, byParser: true },
  { input: "50.1234567 30.1234567", byRegex: true, byParser: true },
  { input: "89.9999999 179.9999999", byRegex: true, byParser: true },
  { input: "90.0 0", byRegex: true, byParser: true },
  { input: "90.0000000 0", byRegex: true, byParser: true },
  { input: "0 180.0", byRegex: true, byParser: true },

  // Agreed: invalid.
  { input: "90.1 0", byRegex: false, byParser: false },
  { input: "0 180.1", byRegex: false, byParser: false },
  { input: "91 0", byRegex: false, byParser: false },
  { input: "0 181", byRegex: false, byParser: false },
  { input: "50.12345678 30.5", byRegex: false, byParser: false },
  { input: "50.5 30.12345678", byRegex: false, byParser: false },
  { input: "50.4501", byRegex: false, byParser: false },
  { input: "50. 30", byRegex: false, byParser: false },
  { input: "50 30.", byRegex: false, byParser: false },
  { input: ".5 .5", byRegex: false, byParser: false },
  { input: "", byRegex: false, byParser: false },
  { input: "   ", byRegex: false, byParser: false },
  { input: "abc", byRegex: false, byParser: false },
  { input: "50.4501, 30.5234, 7", byRegex: false, byParser: false },
  { input: "50,4501 30,5234", byRegex: false, byParser: false },
  { input: "50;30", byRegex: false, byParser: false },
  { input: "180 90", byRegex: false, byParser: false },
  { input: "151.2093 -33.8688", byRegex: false, byParser: false },

  // Parser is more permissive about how the pair is spelled.
  { input: "50.4501,30.5234", byRegex: false, byParser: true },
  { input: "50.4501   30.5234", byRegex: false, byParser: true },
  { input: "50.4501\t30.5234", byRegex: false, byParser: true },
  { input: "50.4501 , 30.5234", byRegex: false, byParser: true },
  { input: " 50.4501 30.5234", byRegex: false, byParser: true },
  { input: "50.4501 30.5234 ", byRegex: false, byParser: true },
  { input: "050 30", byRegex: false, byParser: true },
  { input: "05 06", byRegex: false, byParser: true },
  { input: "00 00", byRegex: false, byParser: true },

  // Gaps: `90(\.0+)?` and `180(\.0+)?` place no bound on the trailing zeros, so the regex
  // admits a precision the parser's 7-decimal rule turns away.
  { input: "90.00000000 0", byRegex: true, byParser: false },
  { input: "0 180.00000000", byRegex: true, byParser: false },
];

const wgs84RCases: Case[] = [
  // Agreed: valid. The first value is a longitude here, so it may exceed 90.
  { input: "50.4501, 30.5234", byRegex: true, byParser: true },
  { input: "50.4501 30.5234", byRegex: true, byParser: true },
  { input: "0 0", byRegex: true, byParser: true },
  { input: "90 0", byRegex: true, byParser: true },
  { input: "-90 0", byRegex: true, byParser: true },
  { input: "+50 +30", byRegex: true, byParser: true },
  { input: "-50.5 -30.5", byRegex: true, byParser: true },
  { input: "50.1234567 30.1234567", byRegex: true, byParser: true },
  { input: "90.0 0", byRegex: true, byParser: true },
  { input: "90.0000000 0", byRegex: true, byParser: true },
  { input: "90.1 0", byRegex: true, byParser: true },
  { input: "91 0", byRegex: true, byParser: true },
  { input: "180 90", byRegex: true, byParser: true },
  { input: "151.2093 -33.8688", byRegex: true, byParser: true },

  // Agreed: invalid. The second value is a latitude, so 180 and 179.9 are out of range.
  { input: "0 180", byRegex: false, byParser: false },
  { input: "0 -180", byRegex: false, byParser: false },
  { input: "89.9999999 179.9999999", byRegex: false, byParser: false },
  { input: "0 180.0", byRegex: false, byParser: false },
  { input: "0 180.00000000", byRegex: false, byParser: false },
  { input: "0 180.1", byRegex: false, byParser: false },
  { input: "0 181", byRegex: false, byParser: false },
  { input: "50.4501", byRegex: false, byParser: false },
  { input: "50. 30", byRegex: false, byParser: false },
  { input: "50 30.", byRegex: false, byParser: false },
  { input: ".5 .5", byRegex: false, byParser: false },
  { input: "", byRegex: false, byParser: false },
  { input: "   ", byRegex: false, byParser: false },
  { input: "abc", byRegex: false, byParser: false },
  { input: "50.4501, 30.5234, 7", byRegex: false, byParser: false },
  { input: "50,4501 30,5234", byRegex: false, byParser: false },
  { input: "50;30", byRegex: false, byParser: false },

  // Parser is more permissive about how the pair is spelled.
  { input: "50.4501,30.5234", byRegex: false, byParser: true },
  { input: "50.4501   30.5234", byRegex: false, byParser: true },
  { input: "50.4501\t30.5234", byRegex: false, byParser: true },
  { input: "50.4501 , 30.5234", byRegex: false, byParser: true },
  { input: " 50.4501 30.5234", byRegex: false, byParser: true },
  { input: "50.4501 30.5234 ", byRegex: false, byParser: true },
  { input: "050 30", byRegex: false, byParser: true },
  { input: "05 06", byRegex: false, byParser: true },
  { input: "00 00", byRegex: false, byParser: true },

  // Gaps. The first is the same unbounded `90(\.0+)?` as in WGS84. The other two are wider:
  // WGS84R spells its fractions `(\.\d+)?` where WGS84 uses `\.\d{1,7}`, so this regex puts
  // no ceiling on precision at all.
  { input: "90.00000000 0", byRegex: true, byParser: false },
  { input: "50.12345678 30.5", byRegex: true, byParser: false },
  { input: "50.5 30.12345678", byRegex: true, byParser: false },
];

conformance(
  "WGS84 regex ↔ WGS84parser",
  WGS84,
  WGS84parser,
  wgs84Cases,
  ["90.00000000 0", "0 180.00000000"],
  [
    "50.4501,30.5234",
    "50.4501   30.5234",
    "50.4501\t30.5234",
    "50.4501 , 30.5234",
    " 50.4501 30.5234",
    "50.4501 30.5234 ",
    "050 30",
    "05 06",
    "00 00",
  ],
);

conformance(
  "WGS84R regex ↔ WGS84Rparser",
  WGS84R,
  WGS84Rparser,
  wgs84RCases,
  ["90.00000000 0", "50.12345678 30.5", "50.5 30.12345678"],
  [
    "50.4501,30.5234",
    "50.4501   30.5234",
    "50.4501\t30.5234",
    "50.4501 , 30.5234",
    " 50.4501 30.5234",
    "50.4501 30.5234 ",
    "050 30",
    "05 06",
    "00 00",
  ],
);

describe("the two regexes disagree with each other", () => {
  // Not a parser concern, but worth pinning: the baseline is not internally consistent, and
  // the parsers inherit whichever reading is chosen when it is reconciled.
  it("WGS84 caps fractions at 7 digits, WGS84R does not", () => {
    expect(WGS84.test("50.12345678 30.5")).toBe(false);
    expect(WGS84R.test("50.12345678 30.5")).toBe(true);
  });

  it("both let the boundary values carry unlimited trailing zeros", () => {
    expect(WGS84.test("90.000000000000 0")).toBe(true);
    expect(WGS84R.test("180.000000000000 0")).toBe(true);
  });
});
