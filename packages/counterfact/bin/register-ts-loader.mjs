/**
 * Register the ts-loader hook using Node's modern module.register() API.
 *
 * Usage (replaces deprecated --loader flag):
 *   node --experimental-strip-types --import ./bin/register-ts-loader.mjs bin/counterfact.js ...
 */

// module.register() was added in Node 20.6 / 22; this file is only used when
// running counterfact under a TypeScript-capable Node runtime (22.6+).
// eslint-disable-next-line n/no-unsupported-features/node-builtins
import { register } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

register("./ts-loader.mjs", pathToFileURL(join(__dirname, "/")));
