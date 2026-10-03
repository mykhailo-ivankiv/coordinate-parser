// One shard of the slow suite; see ../slowSuite.ts. Vitest runs files in parallel, tests in a file
// one after another, so each shard is a file of its own.
import { russiaShard } from "../slowSuite.ts";

russiaShard(0);
