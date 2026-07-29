import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const forbidden = new Set([
  ".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp",
  ".mp3", ".ogg", ".wav", ".hca", ".acb",
  ".moc", ".moc3", ".plist", ".exportjson",
]);
const ignored = new Set([".git", "node_modules", "dist"]);
const violations = [];

async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await walk(path);
    else if (forbidden.has(extname(entry.name).toLowerCase())) violations.push(relative(root, path));
  }
}

await walk(root);
const sourceFiles = [
  "src", "public", "docs", "README.md",
];
for (const source of sourceFiles) {
  try {
    const path = join(root, source);
    const stat = await import("node:fs/promises").then((fs) => fs.stat(path));
    if (!stat.isFile()) continue;
    const body = await readFile(path, "utf8");
    if (body.includes("data:image/") || body.includes("data:audio/")) violations.push(`${source}: embedded media`);
  } catch {}
}

if (violations.length) {
  console.error("Official/media asset guard failed:\\n" + violations.map((item) => ` - ${item}`).join("\\n"));
  process.exit(1);
}
console.log("Asset guard passed: no image/audio/model/game-asset binaries are tracked.");
