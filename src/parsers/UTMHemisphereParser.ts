import { optionalWhitespace, sequenceOf } from "arcsecond";
import { wholeInput } from "./commonParsers.ts";
import { letterFrom, utmLocation, zoneNumber } from "./gridReference.ts";
import type { UTMCoordinate } from "./UTMparser.ts";

// UTM written the way EPSG and PROJ name their zone CRSs, where the letter after the zone number is
// a hemisphere and nothing else: "WGS 84 / UTM zone 17N" is EPSG:32617, "zone 17S" is EPSG:32717
// and means the southern hemisphere. https://epsg.io/32717
//
//   17S 630084 4833438  ->  zone 17, southern hemisphere
//
// This is the same projection as UTMparser reads, spelled by a different community. The two
// disagree only on N and S, and disagree completely there: UTMparser reads S as latitude band S,
// 32-40 degrees north. Every other band letter — T, U, M and the rest — is a parse error here,
// which is why this parser accepts a strict subset of what UTMparser accepts.
//
// Because it is a subset, ordering decides: put this parser first in a `choice` and N/S are read as
// hemispheres while the remaining band letters fall through to UTMparser; put UTMparser first and
// this one never runs. The result carries no `band`, since the string genuinely does not name one.

const HEMISPHERE_LETTERS = "NS";

export const UTMHemisphereParser = wholeInput(
  sequenceOf([
    zoneNumber("UTM"),
    letterFrom(HEMISPHERE_LETTERS, "a hemisphere letter"),
    optionalWhitespace,
    utmLocation("UTM"),
  ]).map(([zone, hemisphere, , location]): UTMCoordinate => ({
    zone,
    hemisphere: hemisphere === "S" ? "S" : "N",
    ...location,
  })),
);
