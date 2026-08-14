import {
  europeanLatitude,
  europeanLongitude,
  latitudeFirst,
  whitespaceOnly,
} from "./commonParsers.ts";

// "50,4501 30,5234" — comma as the decimal mark, so only whitespace can separate the values.
export const EuropeanWGS84parser = latitudeFirst(
  europeanLatitude,
  whitespaceOnly,
  europeanLongitude,
);
