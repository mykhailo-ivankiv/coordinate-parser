import {
  europeanLatitude,
  europeanLongitude,
  longitudeFirst,
  whitespaceOnly,
} from "./commonParsers.ts";

// "30,5234 50,4501" — the reversed European order, longitude first.
export const EuropeanWGS84Rparser = longitudeFirst(
  europeanLongitude,
  whitespaceOnly,
  europeanLatitude,
);
