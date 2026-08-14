import { commaOrWhitespace, latitude, latitudeFirst, longitude } from "./commonParsers.ts";

// "50.4501, 30.5234" — latitude first, comma or whitespace between the values.
export const WGS84parser = latitudeFirst(latitude, commaOrWhitespace, longitude);
