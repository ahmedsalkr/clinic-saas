import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const staticDirectory = path.resolve(".next", "static");
const outputFile = path.join(staticDirectory, "clinic-precache-manifest.js");
const buildId = (await readFile(path.resolve(".next", "BUILD_ID"), "utf8")).trim();
const extensions = new Set([
  ".css",
  ".gif",
  ".ico",
  ".jpeg",
  ".jpg",
  ".js",
  ".png",
  ".svg",
  ".ttf",
  ".webp",
  ".woff",
  ".woff2",
]);

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(fullPath)));
    } else if (
      entry.name !== path.basename(outputFile) &&
      extensions.has(path.extname(entry.name).toLowerCase())
    ) {
      files.push(fullPath);
    }
  }

  return files;
}

const assets = (await collectFiles(staticDirectory))
  .map((file) => `/_next/static/${path.relative(staticDirectory, file).split(path.sep).join("/")}`)
  .sort();

const output = [
  `self.__CLINIC_BUILD_ID__ = ${JSON.stringify(buildId)};`,
  `self.__CLINIC_PRECACHE_ASSETS__ = ${JSON.stringify(assets)};`,
  "",
].join("\n");

await writeFile(outputFile, output, "utf8");
console.log(`Generated offline asset manifest with ${assets.length} assets.`);
