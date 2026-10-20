/**
 * Fails if src/styles/app.css defines a token or a utility that nothing uses.
 * A palette swap leaves the old tokens behind unless something says so; this
 * is that something.
 *
 * A token is used when a component reads it (a utility class such as
 * `bg-app-panel`, `rounded-card`, `duration-micro`, or `var(--x)` / `(--x)`),
 * when a plain rule in app.css reads it, or when a used alias or a used
 * @utility reads it. A @utility is used when a component names it.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const css = readFileSync("src/styles/app.css", "utf8")
	.replace(/\r\n/g, "\n")
	.replace(/\/\*[\s\S]*?\*\//g, "");

const files = [];
(function walk(dir) {
	for (const name of readdirSync(dir)) {
		const path = join(dir, name);
		if (statSync(path).isDirectory()) walk(path);
		else if (/\.tsx?$/.test(name) && name !== "routeTree.gen.ts")
			files.push(path);
	}
})("src");
const source = files.map((f) => readFileSync(f, "utf8")).join("\n");

// Top-level blocks with brace matching: [header, body].
const blocks = [];
for (let i = 0; i < css.length; ) {
	const open = css.indexOf("{", i);
	if (open === -1) break;
	const header = css.slice(css.lastIndexOf("\n", open) + 1, open).trim();
	let depth = 1;
	let j = open + 1;
	for (; j < css.length && depth > 0; j++) {
		if (css[j] === "{") depth++;
		else if (css[j] === "}") depth--;
	}
	blocks.push([header, css.slice(open + 1, j - 1)]);
	i = j;
}

const refs = (text) =>
	new Set([...text.matchAll(/var\((--[\w-]+)/g)].map((m) => m[1]));

const tokens = new Map(); // name -> refs in its own value (aliases)
const utilities = new Map(); // name -> refs in its body
const always = new Set(); // refs from plain rules
for (const [header, body] of blocks) {
	if (header.startsWith("@theme")) {
		for (const m of body.matchAll(/^\s*(--[\w-]+)\s*:([^;]*);/gm))
			tokens.set(m[1], refs(m[2]));
	} else if (header.startsWith("@utility")) {
		utilities.set(header.split(/\s+/)[1], refs(body));
	} else if (header === ".dark" || header.startsWith("@keyframes")) {
		// Redefinitions and keyframes are read through what uses them.
		if (header.startsWith("@keyframes")) continue;
	} else {
		for (const r of refs(body)) always.add(r);
	}
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const classUsed = (name) =>
	new RegExp(`(?<![\\w-])${escapeRe(name)}(?![\\w-])`).test(source);

// The utilities that take a colour, so `data-selected` or a test id ending
// in -chip never counts as a use of --color-selected or --color-chip.
const COLOR_UTILITY =
	"(?:bg|text|fill|stroke|caret|accent|placeholder|decoration|divide|outline|ring|ring-offset|inset-ring|shadow|inset-shadow|from|via|to|border(?:-[xytrblse])?)";

// What a token's key looks like as a class.
function tokenInSource(name) {
	if (source.includes(`var(${name}`) || source.includes(`(${name})`))
		return true;
	const [, ns, key] =
		name.match(/^--(color|radius|shadow|spacing|font|duration|ease|z)-(.+)$/) ??
		[];
	if (!ns) return false;
	const k = escapeRe(key);
	const forms = {
		color: `(?<![\\w-])${COLOR_UTILITY}-${k}(?:/\\d+)?(?![\\w-])`,
		radius: `(?<![\\w-])rounded(?:-[a-z]{1,2})?-${k}(?![\\w-])`,
		shadow: `(?<![\\w-])shadow-${k}(?![\\w-])`,
		spacing: `(?<![\\w-])-?[a-z]+(?:-[a-z])?-${k}(?![\\w-])`,
		font: `(?<![\\w-])font-${k}(?![\\w-])`,
		duration: `(?<![\\w-])duration-${k}(?![\\w-])`,
		ease: `(?<![\\w-])ease-${k}(?![\\w-])`,
		z: `(?<![\\w-])z-${k}(?![\\w-])`,
	};
	return new RegExp(forms[ns]).test(source);
}

const used = new Set(always);
const usedUtilities = new Set(
	[...utilities.keys()].filter((name) => classUsed(name)),
);
for (const name of usedUtilities)
	for (const r of utilities.get(name)) used.add(r);
for (const name of tokens.keys()) if (tokenInSource(name)) used.add(name);
// Aliases pass use on to what they read, until nothing changes.
for (let grew = true; grew; ) {
	grew = false;
	for (const [name, reads] of tokens)
		if (used.has(name))
			for (const r of reads)
				if (!used.has(r)) {
					used.add(r);
					grew = true;
				}
}

const deadTokens = [...tokens.keys()].filter((n) => !used.has(n));
const deadUtilities = [...utilities.keys()].filter(
	(n) => !usedUtilities.has(n),
);
if (deadTokens.length || deadUtilities.length) {
	console.error("check-unused-tokens: app.css defines what nothing uses:");
	for (const n of deadTokens) console.error(`  token   ${n}`);
	for (const n of deadUtilities) console.error(`  utility ${n}`);
	process.exit(1);
}
console.log(
	`check-unused-tokens: all ${tokens.size} tokens and ${utilities.size} utilities are used.`,
);
