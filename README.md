# coordinate-toolkit

Takes a coordinate as people actually write it — pasted from a map, a report or a chat — works out
which notation it is in, and converts it to any other.

Nine notations from four traditions: WGS 84 decimal degrees in either order, DD, DDM and DMS
(ISO 6709), MGRS (NGA), USNG (FGDC), UTM, and the Ukrainian UCS-2000 (УСК-2000), which most
libraries leave out.

- **One input, any notation.** No format to pick: the parser recognises it, including decimal
  commas, hemisphere letters and typographic primes, and says precisely where an input stops making
  sense.
- **A grid reference is a square, not a point.** `36UUA2491` names a 1 km square; the converter
  returns that square's corners along with its centre, and lists every square of the target grid it
  overlaps.
- **Checked against reference implementations.** UTM and UCS-2000 agree with proj4 to the
  millimetre; MGRS, USNG and UTM strings are the ones ArcGIS writes, and ArcGIS and mgrs read them
  back to the same point.

Site, in Ukrainian — parser, converter with a map, a guide to the systems and the API reference:
https://mykhailo-ivankiv.github.io/coordinate-parser/

## Packages

| Package                         | Path                  | What it does                                                     |
| ------------------------------- | --------------------- | ---------------------------------------------------------------- |
| `@coordinate-toolkit/types`     | `packages/types/`     | The coordinate types the other packages share                    |
| `@coordinate-toolkit/parser`    | `packages/parser/`    | Reads a string into a coordinate, and the format for WGS 84      |
| `@coordinate-toolkit/converter` | `packages/converter/` | Converts coordinates to and from WGS 84, and the area each names |
| `@coordinate-toolkit/formatter` | `packages/formatter/` | Writes a coordinate as text, the inverse of the parser           |
| `@coordinate-toolkit/web`       | `apps/web/`           | The site: parser, converter with a map, guide, API reference     |

The parser, the converter and the formatter depend on the types, not on each other. The packages export their
TypeScript source directly (`"exports": "./src/index.ts"`); there is no build step and none is
published to npm.

```ts
import { coordinateParser } from "@coordinate-toolkit/parser";
import { fromMgrsToWgs84, fromWgs84ToUcs2000 } from "@coordinate-toolkit/converter";
import { formatUcs2000 } from "@coordinate-toolkit/formatter";

const parsed = coordinateParser.run("36UUA2418291607");
// parsed.result is [coordinate] for a grid, [coordinate, format] for WGS 84
if (!parsed.isError && parsed.result[0].system === "MGRS") {
  formatUcs2000(fromWgs84ToUcs2000(fromMgrsToWgs84(parsed.result[0])));
}
```

The API reference on the site is generated from each package's `src/index.ts` and its JSDoc; every
`@example` there runs as a test.

## Commands

Run from the repository root (pnpm, Node 24):

| Command          | Does                                                            |
| ---------------- | --------------------------------------------------------------- |
| `pnpm dev`       | Starts the site at http://localhost:5173/coordinate-parser/     |
| `pnpm build`     | Type-checks everything, then builds the site to `apps/web/dist` |
| `pnpm test`      | Runs the tests of both packages and the app                     |
| `pnpm test:slow` | Runs the dense reference checks against proj4, ArcGIS and mgrs  |
| `pnpm lint`      | oxlint                                                          |
| `pnpm fmt`       | oxfmt                                                           |

Pushing to `master` deploys the site to GitHub Pages.
