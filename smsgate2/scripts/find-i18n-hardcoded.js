#!/usr/bin/env node
/**
 * Lightweight scanner to flag likely hardcoded UI strings that should be localized.
 * It looks for JSX text nodes and attribute string literals with readable words.
 */
const fs = require("fs");
const path = require("path");

const roots = [path.join(__dirname, "..", "app"), path.join(__dirname, "..", "components")];
const results = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
    } else if (entry.isFile() && entry.name.endsWith(".tsx")) {
      scanFile(full);
    }
  }
}

const JSX_TEXT = />[^<{][^<]{2,}</g;
const ATTR_TEXT = /\b(?:title|aria-label|placeholder|alt|label)=["']([^{"'<]{3,})["']/g;

function scanFile(file) {
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  lines.forEach((line, idx) => {
    let match;
    while ((match = JSX_TEXT.exec(line))) {
      const text = match[0].replace(/[><]/g, "").trim();
      if (shouldSkip(text)) continue;
      results.push({ file, line: idx + 1, text });
    }
    while ((match = ATTR_TEXT.exec(line))) {
      const text = match[1].trim();
      if (shouldSkip(text)) continue;
      results.push({ file, line: idx + 1, text });
    }
  });
}

function shouldSkip(text) {
  if (!/[A-Za-z]/.test(text)) return true;
  if (text.length < 3) return true;
  const allowed = ["--", "===", ":::", "Promise"]; // common separators to ignore
  if (allowed.some((a) => text.includes(a))) return true;
  return false;
}

roots.forEach((dir) => walk(dir));

if (!results.length) {
  console.log("No obvious hardcoded strings detected.");
} else {
  console.log("Potential hardcoded strings (consider moving to i18n):");
  results.forEach((r) => console.log(`${path.relative(path.join(__dirname, ".."), r.file)}:${r.line} -> "${r.text}"`));
  process.exitCode = 1;
}
