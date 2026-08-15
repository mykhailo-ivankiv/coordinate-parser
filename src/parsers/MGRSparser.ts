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

// Military Grid Reference System, per NGA.STND.0037_2.0.0_GRIDS "Universal Grids and Grid
// Reference Systems" (NGA, 2014) — https://nsgreg.nga.mil/doc/view?i=4057
//
// A reference is a grid zone designator, a 100,000-metre square identifier, and an even
// number of digits splitting into easting and northing:
//
//   4Q FJ 12345 67890
//   ^^ zone 4, latitude band Q
//      ^^ 100 km square, column F, row J
//         ^^^^^ ^^^^^ easting and northing within that square, 1 m precision
//
// I and O are never used as letters anywhere in a reference, to keep them distinct from
// the digits 1 and 0. The letter sets and the numeric location live in gridReference.ts,
// shared with USNG.

export type MGRSCoordinate = GridLocation & {
  zone: number;
  band: string;
  square: string;
};

export const MGRSparser = wholeInput(
  sequenceOf([
    zoneNumber(
      "MGRS",
      " (UPS polar references, which start with band A, B, Y or Z, are not supported)",
    ),
    letterFrom(LATITUDE_BANDS, "a latitude band letter"),
    optionalWhitespace,
    letterFrom(COLUMN_LETTERS, "a 100 km square column letter"),
    letterFrom(ROW_LETTERS, "a 100 km square row letter"),
    optionalWhitespace,
    // MGRS permits a bare 100 km square, so no digits at all is a valid reference.
    numericLocation("MGRS", 0),
  ]).map(([zone, band, , column, row, , location]): MGRSCoordinate => ({
    zone,
    band,
    square: `${column}${row}`,
    ...location,
  })),
);
