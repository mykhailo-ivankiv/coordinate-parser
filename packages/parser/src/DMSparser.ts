import { commaOrWhitespace, latitudeFirst } from "./commonParsers.ts";
import {
  degreesMinutesSeconds,
  LATITUDE_EXPECTED,
  LATITUDE_HEMISPHERES,
  LONGITUDE_EXPECTED,
  LONGITUDE_HEMISPHERES,
  withHemisphere,
} from "./sexagesimal.ts";

// Degrees, minutes and seconds — the ISO 6709 Annex D notation in full.
// https://www.iso.org/standard/75147.html
//
//   50° 27' 0.36"N, 30° 31' 24.24"E
//   ^^ whole degrees
//       ^^ whole minutes
//           ^^^^ seconds, the only component that takes a fraction
//                ^ hemisphere letter, which carries the direction
//
// Both the minute and the second mark are required: the seconds component is what separates this
// notation from DDM, and whole minutes here versus decimal minutes there keeps the two disjoint.
// The angle is reduced to decimal degrees before the range check, so 90°0'0"N is accepted and
// 90°0'1"N is not, without either being a special case in the grammar.

const latitude = withHemisphere(
  degreesMinutesSeconds("latitude", 90),
  LATITUDE_HEMISPHERES,
  LATITUDE_EXPECTED,
  "S",
);

const longitude = withHemisphere(
  degreesMinutesSeconds("longitude", 180),
  LONGITUDE_HEMISPHERES,
  LONGITUDE_EXPECTED,
  "W",
);

export const DMSparser = latitudeFirst(latitude, commaOrWhitespace, longitude);
