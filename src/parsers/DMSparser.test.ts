import { describe, expect, it } from "vitest";
import { type Coordinates } from "./commonParsers.ts";
import { DMS } from "./coordinateRegex.ts";
import { DMSparser } from "./DMSparser.ts";

// Expectations follow the ISO 6709 Annex D notation. See the header of sexagesimal.ts for how the
// three notations in that family relate.

const parse = (input: string): Coordinates => {
  const result = DMSparser.run(input);
  if (result.isError) throw new Error(`expected "${input}" to parse, but got: ${result.error}`);
  return result.result;
};

const errorOf = (input: string): string => {
  const result = DMSparser.run(input);
  if (!result.isError) {
    throw new Error(`expected "${input}" to fail, but got: ${JSON.stringify(result.result)}`);
  }
  return result.error;
};

const accepts = (input: string) => !DMSparser.run(input).isError;

// 50.4501° = 50° 27' 0.36"
const kyiv: Coordinates = { latitude: 50.4501, longitude: 30.5234 };

describe("degrees, minutes and seconds", () => {
  it("converts to the decimal degrees the other notations report", () => {
    expect(parse(`50° 27' 0.36"N, 30° 31' 24.24"E`)).toEqual(kyiv);
  });

  it("accepts whole seconds", () => {
    expect(parse(`50° 27' 0"N, 30° 31' 24"E`)).toEqual({
      latitude: 50.45,
      longitude: 30.5233333,
    });
  });

  it("applies the hemisphere letter to the assembled angle", () => {
    expect(parse(`33° 52' 7.68"S, 151° 12' 33.48"W`)).toEqual({
      latitude: -33.8688,
      longitude: -151.2093,
    });
  });

  it("rejects minutes and seconds at or past 60", () => {
    expect(errorOf(`50° 60' 0"N, 30° 0' 0"E`)).toBe(
      "latitude minutes must be less than 60, but got 60",
    );
    expect(errorOf(`50° 27' 60"N, 30° 0' 0"E`)).toBe(
      "latitude seconds must be less than 60, but got 60",
    );
  });

  it("takes whole minutes only — decimals belong to the seconds", () => {
    expect(errorOf(`50° 27.5' 0"N, 30° 0' 0"E`)).toContain("Expecting a minute mark");
  });
});

describe("ranges", () => {
  it("accepts the poles and the antimeridian", () => {
    expect(parse(`90° 0' 0"N, 180° 0' 0"E`)).toEqual({ latitude: 90, longitude: 180 });
    expect(parse(`0° 0' 0"N, 0° 0' 0"E`)).toEqual({ latitude: 0, longitude: 0 });
  });

  // Reducing the angle first is what makes this fall out without a special case in the grammar.
  it("rejects one second past the pole", () => {
    expect(errorOf(`90° 0' 1"N, 30° 0' 0"E`)).toContain(
      "latitude must be between 0 and 90 degrees",
    );
  });
});

describe("formatting tolerance", () => {
  it.each([
    [`50°27'0.36"N, 30°31'24.24"E`, "no spaces"],
    [`50 27' 0.36"N 30 31' 24.24"E`, "no degree sign, space separator"],
    [`50° 27' 0.36''N, 30° 31' 24.24''E`, "two apostrophes for the second mark"],
    [`50° 27′ 0.36″N, 30° 31′ 24.24″E`, "typographic prime and double prime"],
    [`50° 27' 0.36"n, 30° 31' 24.24"e`, "lowercase hemisphere letters"],
    [`  50° 27' 0.36"N, 30° 31' 24.24"E  `, "padding around the input"],
  ])("accepts %j (%s)", (input) => {
    expect(parse(input)).toEqual(kyiv);
  });

  it("requires the second mark", () => {
    expect(errorOf(`50° 27' 0.36N, 30° 31' 24.24E`)).toContain("Expecting a second mark");
  });

  // The degree sign may go, but the marks that name the components may not.
  it("requires the minute mark even when the degree sign is dropped", () => {
    expect(errorOf(`50 27 0.36"N 30 31 24.24"E`)).toContain("Expecting a minute mark");
  });

  it.each([
    "",
    "   ",
    "abc",
    `50° 27' 0.36"N`,
    "50.4501°N, 30.5234°E",
    "50° 27.006'N, 30° 31.404'E",
  ])("rejects %j", (input) => {
    expect(accepts(input)).toBe(false);
  });
});

// The baseline pattern spells both minutes and seconds `(0?[1-5]?\d|60)`, so it lets 60 through in
// either position.
describe("DMS regex baseline", () => {
  it.each([
    [`50° 27' 60"N, 30° 0' 0"E`, "60 seconds is a whole minute"],
    [`50° 60' 0"N, 30° 0' 0"E`, "60 minutes is a whole degree"],
  ])("regex wrongly accepts %j — %s", (input) => {
    expect(DMS.test(input)).toBe(true);
    expect(accepts(input)).toBe(false);
  });

  it.each([
    [`50°27'0.36"N, 30°31'24.24"E`, "no spaces around the marks"],
    [`  50° 27' 0"N, 30° 31' 24"E  `, "surrounding whitespace"],
    [`50° 27′ 0.36″N, 30° 31′ 24.24″E`, "typographic prime and double prime"],
  ])("regex wrongly rejects %j — %s", (input) => {
    expect(DMS.test(input)).toBe(false);
    expect(accepts(input)).toBe(true);
  });

  it.each([`50° 27' 0.36"N, 30° 31' 24.24"E`, `90° 0' 0"N, 180° 0' 0"E`])(
    "both accept %j",
    (input) => {
      expect(DMS.test(input)).toBe(true);
      expect(accepts(input)).toBe(true);
    },
  );

  it.each(["", "abc"])("both reject %j", (input) => {
    expect(DMS.test(input)).toBe(false);
    expect(accepts(input)).toBe(false);
  });
});
