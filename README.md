# coordinate-parser

Parses and converts coordinates in nine notations: WGS 84 decimal (latitude or longitude first),
DD, DDM, DMS, MGRS, USNG, UTM and UCS-2000 (УСК-2000).

Site: https://mykhailo-ivankiv.github.io/coordinate-parser/

## Packages

| Package                        | Path                  | What it does                                                    |
| ------------------------------ | --------------------- | --------------------------------------------------------------- |
| `@coordinate-parser/parser`    | `packages/parser/`    | Reads a string, reports the notation and its parts              |
| `@coordinate-parser/converter` | `packages/converter/` | Converts parsed coordinates to and from WGS 84, with their area |
| `@coordinate-parser/web`       | `apps/web/`           | The site: parser, converter with a map, guide, API reference    |

The converter depends on the parser. Both export their TypeScript source directly
(`"exports": "./src/index.ts"`); there is no build step and neither is published to npm.

```ts
import { coordinateParser } from "@coordinate-parser/parser";
import { fromWGS84, toWGS84 } from "@coordinate-parser/converter";

const parsed = coordinateParser.run("36UUA2418291607");
if (!parsed.isError) fromWGS84(toWGS84(parsed.result), "UCS-2000").value;
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
