/**
 * Fails on a raw colour anywhere in src/ outside src/styles/, which is the only
 * place token values are defined. A component that needs a colour the tokens
 * lack needs a token change, not a literal. Catches hex, CSS colour functions,
 * Tailwind's default palette (bg-red-500, text-white), and arbitrary colour
 * values (bg-[#fff]).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const PALETTE =
	"slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|black|white";
const UTILITY =
	"bg|text|border(?:-[trblxyse])?|ring|ring-offset|outline|fill|stroke|from|via|to|shadow|decoration|accent|caret|divide|placeholder";

const RULES = [
	["hex colour", /#[0-9a-fA-F]{3,8}\b/],
	["CSS colour function", /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(/],
	[
		"Tailwind palette colour",
		new RegExp(`\\b(?:${UTILITY})-(?:${PALETTE})(?:-\\d{2,3})?\\b`),
	],
	["arbitrary colour value", /-\[(?:#|rgb|hsl|oklch|oklab|color:)/],
];

function* files(dir) {
	for (const name of readdirSync(dir)) {
		const path = join(dir, name);
		if (statSync(path).isDirectory()) {
			if (path === join("src", "styles")) continue;
			yield* files(path);
		} else if (/\.(tsx?|css)$/.test(name) && name !== "routeTree.gen.ts") {
			yield path;
		}
	}
}

const hits = [];
let scanned = 0;
for (const path of files("src")) {
	scanned++;
	const lines = readFileSync(path, "utf8").split(/\r?\n/);
	lines.forEach((line, i) => {
		for (const [what, pattern] of RULES) {
			const match = line.match(pattern);
			if (match) hits.push(`${path}:${i + 1}  ${what}: ${match[0]}`);
		}
	});
}

if (scanned === 0) {
	console.error(
		"check-raw-colors: scanned no files, so this check would pass vacuously.",
	);
	process.exit(1);
}
if (hits.length > 0) {
	console.error(
		`check-raw-colors: ${hits.length} raw colour(s). Use a token from src/styles/app.css.`,
	);
	for (const hit of hits) console.error(`  ${hit}`);
	process.exit(1);
}
console.log(`check-raw-colors: ${scanned} files, no raw colours.`);
