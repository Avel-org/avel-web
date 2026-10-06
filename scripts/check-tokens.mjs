/**
 * Fails if any token defined in src/styles/app.css is missing from the
 * production CSS. Tailwind v4 silently drops theme tokens no utility class
 * uses; `@theme static` prevents that, and this proves it held. The previous
 * build lost every gate, diff, radius and motion token from dark mode only,
 * with a green build. Run after `vite build`.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync("src/styles/app.css", "utf8").replace(
	/\r\n/g,
	"\n",
);

// Every top-level `@theme static { … }` and `.light { … }` block. Blocks close
// with a brace at column 0, and token values never contain one.
function blocks(header) {
	const found = [];
	const pattern = new RegExp(`^${header}\\s*\\{\\n([\\s\\S]*?)^\\}`, "gm");
	for (const match of source.matchAll(pattern)) found.push(match[1] ?? "");
	return found;
}

function names(body) {
	// Comments may mention token names; only declarations count.
	const code = body.replace(/\/\*[\s\S]*?\*\//g, "");
	return [...code.matchAll(/^\s*(--[\w-]+)\s*:/gm)].map((m) => m[1]);
}

// Every @theme block except `inline` aliases, whether or not it says static,
// so a block that loses `static` is still checked rather than skipped.
const themeBlocks = blocks("@theme(?: static)?");
const lightBlocks = blocks("\\.light");

const unstatic = [...source.matchAll(/^@theme([^{]*)\{/gm)]
	.map((m) => (m[1] ?? "").trim().split(/\s+/))
	.filter(
		(options) => !options.includes("static") && !options.includes("inline"),
	);
if (unstatic.length > 0) {
	console.error(
		`check-tokens: ${unstatic.length} @theme block(s) in app.css without \`static\`. Tailwind drops any token in them that no utility uses.`,
	);
	process.exit(1);
}

if (themeBlocks.length === 0 || lightBlocks.length === 0) {
	console.error(
		"check-tokens: found no `@theme static` or `.light` block in app.css. The parser no longer matches the file, so this check would pass vacuously.",
	);
	process.exit(1);
}

const assetsDir = ".output/public/assets";
let built;
try {
	built = readdirSync(assetsDir)
		.filter((f) => f.endsWith(".css"))
		.map((f) => readFileSync(join(assetsDir, f), "utf8"))
		.join("\n");
} catch {
	console.error(
		`check-tokens: no build at ${assetsDir}. Run \`pnpm build\` first.`,
	);
	process.exit(1);
}
if (!built) {
	console.error(`check-tokens: ${assetsDir} has no CSS.`);
	process.exit(1);
}

const missing = [];
for (const name of themeBlocks.flatMap(names)) {
	if (!built.includes(`${name}:`)) missing.push(name);
}

// Light overrides must survive inside a .light rule, not merely somewhere.
const lightRules = [...built.matchAll(/\.light\s*\{([^}]*)\}/g)]
	.map((m) => m[1])
	.join(";");
for (const name of lightBlocks.flatMap(names)) {
	if (!lightRules.includes(`${name}:`)) missing.push(`${name} (in .light)`);
}

if (missing.length > 0) {
	console.error(
		`check-tokens: ${missing.length} token(s) missing from the build:`,
	);
	for (const name of missing) console.error(`  ${name}`);
	process.exit(1);
}

const total =
	themeBlocks.flatMap(names).length + lightBlocks.flatMap(names).length;
console.log(
	`check-tokens: all ${total} token declarations present in the build.`,
);
