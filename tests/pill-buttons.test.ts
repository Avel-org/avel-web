import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Ruling 30: every button is a pill. Rows and surfaces keep their own radii:
// nav plates, menu items, list rows, tree items, inputs and cards. This reads
// the source, so a new control that forgets the rule fails here, not in
// review.

const SRC = fileURLToPath(new URL("../src", import.meta.url));

function files(dir: string): string[] {
	return readdirSync(dir).flatMap((name) => {
		const path = join(dir, name);
		if (statSync(path).isDirectory()) return files(path);
		return path.endsWith(".tsx") ? [path] : [];
	});
}

/**
 * Every opening tag of `name` in `source`, from `<name` to its closing `>`.
 * Scans braces and quotes, because attributes hold arrows (`=>`) and nested
 * JSX that a regex would cut short.
 */
function openingTags(source: string, name: string): string[] {
	const tags: string[] = [];
	const opener = new RegExp(`<${name}(?=[\\s>])`, "g");
	for (let m = opener.exec(source); m; m = opener.exec(source)) {
		let depth = 0;
		let quote: string | null = null;
		for (let i = m.index + 1; i < source.length; i++) {
			const c = source[i];
			if (quote) {
				if (c === quote && source[i - 1] !== "\\") quote = null;
			} else if (c === '"' || c === "'" || c === "`") quote = c;
			else if (c === "{") depth++;
			else if (c === "}") depth--;
			else if (c === ">" && depth === 0) {
				tags.push(source.slice(m.index, i + 1));
				break;
			}
		}
	}
	return tags;
}

/** The radius utilities a tag's class strings use, variants stripped. */
function radii(tag: string): string[] {
	return [
		...tag.matchAll(/(?<=["'`\s:])rounded(?:-[a-z0-9[\]().%-]+)?(?=["'`\s])/g),
	].map((m) => m[0]);
}

/** A pill: rounded-full, and no other radius anywhere on it. */
function isPill(tag: string): boolean {
	const found = radii(tag);
	return (
		found.includes("rounded-full") && found.every((r) => r === "rounded-full")
	);
}

/**
 * Hand-rolled buttons that are rows or surfaces, not buttons, each with why.
 * Keyed by file and a fragment of the tag that names it.
 */
const EXCEPTIONS: { file: string; marker: string; why: string }[] = [
	{
		file: "shell/sidebar.tsx",
		marker: "data-testid={testId}",
		why: "a nav parent row: a plate, like the links",
	},
	{
		file: "shell/sidebar.tsx",
		marker: 'data-testid="operator-menu"',
		why: "the operator card",
	},
	{
		file: "components/avel/data-panel.tsx",
		marker: "-toggle`}",
		why: "a panel's full-width header row",
	},
	{
		file: "components/avel/mission-details.tsx",
		marker: "-toggle`}",
		why: "a section's full-width header row",
	},
	{
		file: "components/avel/mission-watch.tsx",
		marker: "-row-",
		why: "a list row",
	},
	{
		file: "components/avel/catalog-agent-inspector.tsx",
		marker: "catalog-agent-edge-row-",
		why: "an edge row in the agent panel (ruling 34)",
	},
	{
		file: "components/avel/drive-files.tsx",
		marker: "drive-card-",
		why: "a file card in the grid (ruling 33)",
	},
	{
		file: "components/avel/drive-files.tsx",
		marker: "drive-recent-",
		why: "a recent-file card (ruling 33)",
	},
	{
		file: "components/avel/drive-rail.tsx",
		marker: "drive-folder-",
		why: "a folder row in the rail, like a sidebar link",
	},
	{
		file: "components/avel/drive-rail.tsx",
		marker: "onChange(target(i))",
		why: "a breadcrumb step: text, like the shell's breadcrumbs",
	},
	{
		file: "components/avel/loadout-board.tsx",
		marker: "chipRefs.current.set(entry.id, el)",
		why: "a roster chip's name: the chip card around it is the surface",
	},
];

const sources = files(SRC).map((path) => ({
	file: relative(SRC, path).replaceAll("\\", "/"),
	source: readFileSync(path, "utf8"),
}));

const excepted = (file: string, tag: string) =>
	EXCEPTIONS.some((e) => e.file === file && tag.includes(e.marker));

describe("every button is a pill (ruling 30)", () => {
	it("found the source", () => {
		expect(sources.length).toBeGreaterThan(20);
	});

	it("the Button primitive is rounded-full at every variant and size", () => {
		const button = sources.find((s) => s.file === "components/ui/button.tsx");
		const source = button?.source ?? "";
		const variants = source.slice(
			source.indexOf("const buttonVariants = cva("),
			source.indexOf("defaultVariants"),
		);
		expect(variants).toContain("rounded-full");
		expect(
			radii(` ${variants.replaceAll('"', " ")} `).filter(
				(r) => r !== "rounded-full",
			),
		).toEqual([]);
	});

	it("no <Button> overrides its radius", () => {
		const offenders = sources.flatMap(({ file, source }) =>
			openingTags(source, "Button")
				.filter((tag) => radii(tag).some((r) => r !== "rounded-full"))
				.map((tag) => `${file}: ${tag.slice(0, 80)}`),
		);
		expect(offenders).toEqual([]);
	});

	it("every hand-rolled <button> is a pill, unless it is a row or a surface", () => {
		const offenders = sources.flatMap(({ file, source }) =>
			openingTags(source, "button")
				.filter((tag) => !excepted(file, tag) && !isPill(tag))
				.map((tag) => `${file}: ${tag.replace(/\s+/g, " ").slice(0, 120)}`),
		);
		expect(offenders).toEqual([]);
	});

	it("every exception still names a real button", () => {
		const stale = EXCEPTIONS.filter(
			(e) =>
				!sources.some(
					({ file, source }) =>
						file === e.file &&
						openingTags(source, "button").some((tag) => tag.includes(e.marker)),
				),
		);
		expect(stale).toEqual([]);
	});
});

describe("the scanner itself", () => {
	it("reads a whole tag, past arrows and nested braces", () => {
		const [tag] = openingTags(
			'<button onClick={() => go({ a: 1 })} className="x rounded-sm">y</button>',
			"button",
		);
		expect(tag).toBe(
			'<button onClick={() => go({ a: 1 })} className="x rounded-sm">',
		);
	});

	it("tells a pill from a square, a 6px and a mixed radius", () => {
		expect(isPill('<button className="rounded-full px-3">')).toBe(true);
		expect(isPill('<button className="px-3">')).toBe(false);
		expect(isPill('<button className="rounded-sm px-3">')).toBe(false);
		expect(
			isPill('<button className={cn("rounded-full", x && "rounded-xs")}>'),
		).toBe(false);
		expect(isPill('<button className="rounded-full hover:rounded-md">')).toBe(
			false,
		);
	});
});
