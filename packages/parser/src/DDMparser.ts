import { commaOrWhitespace, latitudeFirst } from "./commonParsers.ts";
import {
  degreesMinutes,
  LATITUDE_EXPECTED,
  LATITUDE_HEMISPHERES,
  LONGITUDE_EXPECTED,
  LONGITUDE_HEMISPHERES,
  withHemisphere,
} from "./sexagesimal.ts";

// Degrees and decimal minutes, the ISO 6709 Annex D notation between DD and DMS.
// https://www.iso.org/standard/75147.html
//
//   50° 27.006'N, 30° 31.404'E
//   ^^ whole degrees
//       ^^^^^^ minutes, the only component that takes a fraction
//              ^ hemisphere letter, which carries the direction
//
// The minute mark is required — it is what separates this notation from DD — while the degree sign
// stays optional. Minutes must fall below 60; anything at or above belongs in the degrees.

const latitude = withHemisphere(
  degreesMinutes("latitude", 90),
  LATITUDE_HEMISPHERES,
  LATITUDE_EXPECTED,
  "S",
);

const longitude = withHemisphere(
  degreesMinutes("longitude", 180),
  LONGITUDE_HEMISPHERES,
  LONGITUDE_EXPECTED,
  "W",
);

export const DDMparser = latitudeFirst(latitude, commaOrWhitespace, longitude);
