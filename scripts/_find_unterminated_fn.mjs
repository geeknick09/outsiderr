// Find dollar-quoted function bodies whose closing tag is not followed by ';'.
// Usage: node scripts/_find_unterminated_fn.mjs
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const lines = readFileSync(join(__dirname, "..", "supabase", "migrations", "fix_all.sql"), "utf-8").split("\n");
const bad = [];
lines.forEach((line, i) => {
  if (/^\$(function|body|fn)?\$\s*$/.test(line.trim()) || /^\$[a-z_]*\$$/.test(line.trim())) {
    const next = lines.slice(i + 1).find((l) => l.trim() !== "") ?? "";
    if (!line.trim().endsWith(";") && !/^\s*;/.test(next)) bad.push(i + 1);
  }
});
console.log(bad.length ? `unterminated closing tags at lines: ${bad.join(", ")}` : "no unterminated dollar-quoted bodies found");
