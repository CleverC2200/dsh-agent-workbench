/** Explicit offline conversion of an exported browser association file; no Host/profile access. */
import { readFile, writeFile } from "node:fs/promises";

const [input, output] = process.argv.slice(2);
if (!input || !output || process.argv.length !== 4) throw Error("USAGE: node scripts/upgrade-workbench-associations.mjs input.json new-output.json");
const rows = JSON.parse(await readFile(input, "utf8"));
if (!Array.isArray(rows)) throw Error("INVALID_ASSOCIATION_EXPORT");
const converted = rows.map(row => {
  if (!Array.isArray(row) || ![3, 4].includes(row.length) || typeof row[0] !== "string" || typeof row[1] !== "string" || !Array.isArray(row[2]))
    throw Error("INVALID_ASSOCIATION_EXPORT");
  if (row[2].some(pair => !Array.isArray(pair) || pair.length !== 2 || typeof pair[0] !== "string" || typeof pair[1] !== "string" || !/^session-[0-9a-f-]{36}$/.test(pair[1])))
    throw Error("INVALID_ASSOCIATION_EXPORT");
  if (row.length === 4 && row[3] !== null && typeof row[3] !== "string") throw Error("INVALID_ASSOCIATION_EXPORT");
  return [row[0], row[1], row[2], row.length === 4 ? row[3] : null];
});
// Never overwrite the export or an existing output. Unknown old identity is not promoted to a trusted scope.
await writeFile(output, JSON.stringify(converted, null, 2) + "\n", { flag: "wx" });
