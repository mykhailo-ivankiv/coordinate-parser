import { optionalWhitespace, sequenceOf } from "arcsecond";
import { wholeInput } from "./commonParsers.ts";
import {
  COLUMN_LETTERS,
  type GridLocation,
  LATITUDE_BANDS,
  letterFrom,
  numericLocation,
  ROW_LETTERS,
  zoneNumber,
} from "./gridReference.ts";

// United States National Grid, per FGDC-STD-011-2001 "United States National Grid" (Federal
// Geographic Data Committee, 2001)
// — https://www.fgdc.gov/standards/projects/FGDC-standards-projects/usng/fgdc_std_011_2001_usng.pdf
//
// USNG adopts the MGRS grid wholesale and constrains how it is written:
//
//   10S GJ 06832 44683
//   ^^^ zone 10, latitude band S
//       ^^ 100 km square, column G, row J
//          ^^^^^ ^^^^^ easting and northing, 1 m precision
//
// Two differences from MGRS are expressed here:
//
//   * at least one digit per axis, so the coarsest USNG reference is a 10 km square. MGRS lets a
//     reference name a bare 100 km square ("10S GJ"); USNG does not.
//   * no polar references. USNG is defined over the United States, which UTM covers in full.
//
// Not expressed here, deliberately:
//
//   * the geographic bound. USNG is defined "for use over all areas of the United States",
//     including territories, and encoding that as a zone/band whitelist risks turning away valid
//     references from Alaska, Hawaii, Puerto Rico or Guam. Zones stay 1-60, as in MGRS.
//   * the truncated forms. FGDC allows dropping the zone designator, and the 100 km square with
//     it, once every coordinate in a document shares them. Those forms cannot name a point on
//     their own, so they are out of scope here.
//   * the "(NAD 27)" datum suffix, which USNG carries when the reference is not on NAD 83/WGS 84.
//     The datum changes the meaning of the square letters, not the shape of the string.

export type USNGCoordinate = GridLocation & {
  zone: number;
  band: string;
  square: string;
};

export const USNGparser = wholeInput(
  sequenceOf([
    zoneNumber("USNG"),
    letterFrom(LATITUDE_BANDS, "a latitude band letter"),
    optionalWhitespace,
    letterFrom(COLUMN_LETTERS, "a 100 km square column letter"),
    letterFrom(ROW_LETTERS, "a 100 km square row letter"),
    optionalWhitespace,
    numericLocation("USNG", 1),
  ]).map(([zone, band, , column, row, , location]): USNGCoordinate => ({
    zone,
    band,
    square: `${column}${row}`,
    ...location,
  })),
);
