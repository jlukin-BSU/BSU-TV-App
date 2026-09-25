import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

/** Where the built hub UI lives. In the bundled output this file is dist/index.mjs, so the UI is dist/public. */
export function publicDir(): string {
  const fromEnv = process.env["PUBLIC_DIR"];
  if (fromEnv && fromEnv.trim() !== "") return path.resolve(fromEnv.trim());
  return path.resolve(here, "public");
}
