import {
  commaOrWhitespace,
  latitudeFirst,
  unsignedLatitude,
  unsignedLongitude,
} from "./commonParsers.ts";
import {
  decimalDegreesAngle,
  LATITUDE_EXPECTED,
  LATITUDE_HEMISPHERES,
  LONGITUDE_EXPECTED,
  LONGITUDE_HEMISPHERES,
  withHemisphere,
} from "./sexagesimal.ts";

// Decimal degrees in the human-readable notation of ISO 6709 "Standard representation of geographic
// point location by coordinates", Annex D — https://www.iso.org/standard/75147.html
//
//   50.4501°N, 30.5234°E
//   ^^^^^^^ magnitude, never signed
//          ^ degree sign
//           ^ hemisphere: N or S for latitude, E or W for longitude
//
// ISO 6709 carries two notations. The normative one (Annex H) is machine-oriented and signed, with
// fixed-width fields and no symbols — "+50.4501+030.5234/" — and that is closer to what WGS84parser
// reads. This parser implements the Annex D display notation, where direction comes from a letter
// instead of a sign. That is the whole difference between DD and WGS84 in this library, and it is
// why the hemisphere letter is required: without it there is nothing to tell the two apart.
//
// The degree sign is optional. It is a typographic mark rather than information, keyboards rarely
// carry it, and the hemisphere letter alone already identifies the notation unambiguously.
//
// A written sign is rejected rather than combined: "-50.4501°S" states the direction twice, and
// guessing which one the author meant is worse than saying so.

const latitude = withHemisphere(
  decimalDegreesAngle(unsignedLatitude),
  LATITUDE_HEMISPHERES,
  LATITUDE_EXPECTED,
  "S",
);

const longitude = withHemisphere(
  decimalDegreesAngle(unsignedLongitude),
  LONGITUDE_HEMISPHERES,
  LONGITUDE_EXPECTED,
  "W",
);

export const DDparser = latitudeFirst(latitude, commaOrWhitespace, longitude);
