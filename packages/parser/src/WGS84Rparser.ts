import { commaOrWhitespace, latitude, longitude, longitudeFirst } from "./commonParsers.ts";

// "30.5234, 50.4501" — the reversed order, longitude first.
export const WGS84Rparser = longitudeFirst(longitude, commaOrWhitespace, latitude);
