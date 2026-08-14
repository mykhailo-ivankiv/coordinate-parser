import { describe, expect, it } from "vitest";
import { MGRS } from "./coordinateRegex.ts";
import { type MGRSCoordinate, MGRSparser } from "./MGRSparser.ts";

// Expectations follow NGA.STND.0037_2.0.0_GRIDS "Universal Grids and Grid Reference Systems"
// (NGA, 2014) — https://nsgreg.nga.mil/doc/view?i=4057

const parse = (input: string): MGRSCoordinate => {
  const result = MGRSparser.run(input);
  if (result.isError) throw new Error(`expected "${input}" to parse, but got: ${result.error}`);
  return result.result;
};

const errorOf = (input: string): string => {
  const result = MGRSparser.run(input);
  if (!result.isError) {
    throw new Error(`expected "${input}" to fail, but got: ${JSON.stringify(result.result)}`);
  }
  return result.error;
};

const accepts = (input: string) => !MGRSparser.run(input).isError;

describe("grid zone designator", () => {
  it("reads the zone number and latitude band", () => {
    expect(parse("4QFJ")).toMatchObject({ zone: 4, band: "Q" });
    expect(parse("31UDQ")).toMatchObject({ zone: 31, band: "U" });
  });

  it("accepts the full zone range", () => {
    expect(parse("1CAA").zone).toBe(1);
    expect(parse("60XAA").zone).toBe(60);
  });

  it("rejects zones outside 1-60", () => {
    expect(errorOf("0QFJ")).toBe('MGRS zone must be between 1 and 60, but got "0"');
    expect(errorOf("61QFJ")).toBe('MGRS zone must be between 1 and 60, but got "61"');
    expect(errorOf("100QFJ")).toBe('MGRS zone must be between 1 and 60, but got "100"');
  });

  it.each([..."CDEFGHJKLMNPQRSTUVWX"])("accepts latitude band %s", (band) => {
    expect(parse(`4${band}FJ`).band).toBe(band);
  });

  it.each(["I", "O"])("rejects latitude band %s, reserved to avoid 1 and 0", (band) => {
    expect(errorOf(`4${band}FJ`)).toContain("Expecting a latitude band letter");
  });

  it.each(["A", "B", "Y", "Z"])("rejects UPS polar band %s", (band) => {
    expect(errorOf(`4${band}FJ`)).toContain("Expecting a latitude band letter");
  });

  it("names UPS explicitly when a reference starts with a polar band", () => {
    expect(errorOf("AZZ12345")).toContain("UPS polar references");
  });
});

describe("100 km square identifier", () => {
  it("keeps the column and row letters together", () => {
    expect(parse("4QFJ").square).toBe("FJ");
  });

  it("allows the column letter to run to Z", () => {
    expect(parse("4QZA").square).toBe("ZA");
  });

  it("stops the row letter at V", () => {
    expect(parse("4QAV").square).toBe("AV");
    expect(errorOf("4QAW")).toContain("Expecting a 100 km square row letter");
  });

  it.each(["I", "O"])("rejects column letter %s", (letter) => {
    expect(errorOf(`4Q${letter}J`)).toContain("Expecting a 100 km square column letter");
  });

  it.each(["I", "O"])("rejects row letter %s", (letter) => {
    expect(errorOf(`4QF${letter}`)).toContain("Expecting a 100 km square row letter");
  });
});

describe("numeric location", () => {
  // Dropping digits coarsens the reference; it never moves it.
  it.each([
    ["4QFJ", 0, 0, 100000],
    ["4QFJ16", 10000, 60000, 10000],
    ["4QFJ1267", 12000, 67000, 1000],
    ["4QFJ123678", 12300, 67800, 100],
    ["4QFJ12346789", 12340, 67890, 10],
    ["4QFJ1234567890", 12345, 67890, 1],
  ])("%s resolves to %i E, %i N at %i m", (input, easting, northing, precision) => {
    expect(parse(input)).toEqual({
      zone: 4,
      band: "Q",
      square: "FJ",
      easting,
      northing,
      precision,
    });
  });

  it("splits a single digit run in half", () => {
    expect(parse("4QFJ1234567890")).toMatchObject({ easting: 12345, northing: 67890 });
  });

  it("accepts the halves written separately", () => {
    expect(parse("4Q FJ 12345 67890")).toEqual(parse("4QFJ1234567890"));
    expect(parse("4Q FJ 12 67")).toEqual(parse("4QFJ1267"));
  });

  it("rejects an odd number of digits", () => {
    expect(errorOf("4QFJ123")).toBe("MGRS location must have an even number of digits, but got 3");
  });

  it("rejects more than 5 digits per axis", () => {
    expect(errorOf("4QFJ123456789012")).toBe("MGRS allows at most 5 digits per axis, but got 6");
  });

  it("rejects halves of unequal length", () => {
    expect(errorOf("4Q FJ 123 45")).toBe(
      "MGRS easting and northing must carry the same number of digits, but got 3 and 2",
    );
  });
});

describe("formatting tolerance", () => {
  const canonical = parse("4QFJ1234567890");

  it.each([
    ["4Q FJ 12345 67890", "spaces between every component"],
    ["4Q FJ 1234567890", "spaces around the square only"],
    ["4qfj1234567890", "lowercase"],
    ["  4QFJ1234567890  ", "padding around the input"],
    ["04QFJ1234567890", "zero-padded zone number"],
  ])("accepts %j (%s)", (input) => {
    expect(parse(input)).toEqual(canonical);
  });

  it.each(["", "   ", "abc", "4Q", "4QFJ1234567890 extra", "50.4501, 30.5234"])(
    "rejects %j",
    (input) => {
      expect(accepts(input)).toBe(false);
    },
  );
});

// The MGRS entry in coordinateRegex.ts predates this parser and does not match the standard.
// These tests pin the disagreement in both directions so it stays visible until the baseline
// is revised; unlike the WGS84 pair, every disagreement here is a defect in the regex.
describe("MGRS regex baseline", () => {
  it.each([
    ["12IZZ1234512345", "band I is reserved"],
    ["12AZZ1234512345", "band A belongs to UPS, not UTM"],
    ["12QOO1234512345", "square letter O is reserved"],
    ["12QFW1234512345", "row letters stop at V"],
    ["61QFJ1234512345", "zone 61 does not exist"],
    ["00QFJ1234512345", "zone 00 does not exist"],
    ["12QFJ1234567812345678", "8 digits per axis exceeds 1 m precision"],
    ["12QFJ123456781234", "halves of unequal length"],
  ])("regex wrongly accepts %j — %s", (input) => {
    expect(MGRS.test(input)).toBe(true);
    expect(accepts(input)).toBe(false);
  });

  it.each([
    ["4QFJ1234567890", "single-digit zone"],
    ["4Q FJ 12345 67890", "single-digit zone, spaced"],
    ["4QFJ", "100 km precision"],
    ["4QFJ16", "10 km precision"],
    ["4QFJ1267", "1 km precision"],
    ["4QFJ123678", "100 m precision"],
    ["4QFJ12346789", "10 m precision"],
  ])("regex wrongly rejects %j — %s", (input) => {
    expect(MGRS.test(input)).toBe(false);
    expect(accepts(input)).toBe(true);
  });

  it("the two agree on well-formed two-digit-zone references at 1 m", () => {
    for (const input of ["04QFJ1234567890", "31UDQ4825111930"]) {
      expect(MGRS.test(input)).toBe(true);
      expect(accepts(input)).toBe(true);
    }
  });
});
