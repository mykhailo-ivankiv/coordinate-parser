import { optionalWhitespace, sequenceOf } from "arcsecond";
import { wholeInput } from "./commonParsers.ts";
import {
  LATITUDE_BANDS,
  letterFrom,
  type UTMLocation,
  utmLocation,
  zoneNumber,
} from "./gridReference.ts";

// Universal Transverse Mercator, per NGA.STND.0037_2.0.0_GRIDS "Universal Grids and Grid Reference
// Systems" (NGA, 2014) — https://nsgreg.nga.mil/doc/view?i=4057
//
//   17T 630084 4833438
//   ^^ zone 17, one of 60 six-degree zones counted east from the antimeridian
//      ^ latitude band T, 40-48 degrees north
//          ^^^^^^ metres east of the zone's false origin
//                 ^^^^^^^ metres north of the equator
//
// The letter is read as a LATITUDE BAND, the reading NGA.STND.0037 defines and the one MGRS and
// USNG already use in this library. Bands run C to X, eight degrees each, I and O omitted; C-M lie
// south of the equator and N-X north of it, so the hemisphere follows from the band.
//
// Beware "17S". Under this reading it is band S, 32-48 degrees NORTH. Under the EPSG and PROJ
// convention — "WGS 84 / UTM zone 17S", EPSG:32717 — the same string means the SOUTHERN hemisphere,
// and the two readings put the point about ninety degrees of latitude apart. Only N and S collide;
// every other band letter is meaningless to the EPSG convention. UTMHemisphereParser implements
// that other reading, and the order of the two in a `choice` decides which one wins.
//
// Nothing here cross-checks the band against the northing, though they can contradict each other:
// "17N 630084 4833438" claims band N, 0-8 degrees north, but carries a northing some 4300 km up.
// Catching that needs the inverse projection, which is a conversion concern, not a parsing one.

export type UTMCoordinate = UTMLocation & {
  zone: number;
  hemisphere: "N" | "S";
  /** Latitude band, present only when the reference is written with one. */
  band?: string;
};

const LAST_SOUTHERN_BAND = "M";

const hemisphereOf = (band: string): "N" | "S" =>
  LATITUDE_BANDS.indexOf(band) <= LATITUDE_BANDS.indexOf(LAST_SOUTHERN_BAND) ? "S" : "N";

export const UTMparser = wholeInput(
  sequenceOf([
    zoneNumber("UTM"),
    letterFrom(LATITUDE_BANDS, "a latitude band letter"),
    optionalWhitespace,
    utmLocation("UTM"),
  ]).map(([zone, band, , location]): UTMCoordinate => ({
    zone,
    band,
    hemisphere: hemisphereOf(band),
    ...location,
  })),
);
