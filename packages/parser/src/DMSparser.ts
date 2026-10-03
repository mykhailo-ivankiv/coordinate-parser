import { commaOrWhitespace, latitudeFirst } from "./commonParsers.ts";
import { degreesMinutesSeconds, eastOrWest, northOrSouth } from "./sexagesimal.ts";

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

export const DMSparser = latitudeFirst(
  northOrSouth(degreesMinutesSeconds("latitude", 90)),
  commaOrWhitespace,
  eastOrWest(degreesMinutesSeconds("longitude", 180)),
);
