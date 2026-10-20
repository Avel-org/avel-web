import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Design system v3 .btn: every button is a control, at the control radius.
// The one exception is a segment, a chip inside its track's 3px padding, at
// the nearest smaller radius. This reads the source, so a <Button> that sets
// its own radius fails here, not in review.

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

const sources = files(SRC).map((path) => ({
	file: relative(SRC, path).replaceAll("\\", "/"),
	source: readFileSync(path, "utf8"),
}));

const button =
	sources.find((s) => s.file === "components/ui/button.tsx")?.source ?? "";
const variants = button.slice(
	button.indexOf("const buttonVariants = cva("),
	button.indexOf("defaultVariants"),
);

describe("every button is a v3 control", () => {
	it("found the source", () => {
		expect(sources.length).toBeGreaterThan(20);
		expect(variants).not.toBe("");
	});

	it("the Button primitive is rounded-control, and a segment rounded-sm", () => {
		const base = variants.slice(0, variants.indexOf("variants:"));
		expect(radii(` ${base.replaceAll('"', " ")} `)).toEqual([
			"rounded-control",
		]);
		const segment = variants.slice(variants.indexOf('variant: "segment"'));
		expect(segment).toMatch(/variant: "segment", class: "[^"]*\brounded-sm\b/);
		expect(
			radii(` ${variants.replaceAll('"', " ")} `).filter(
				(r) => r !== "rounded-control" && r !== "rounded-sm",
			),
		).toEqual([]);
	});

	it("no <Button> overrides its radius", () => {
		const offenders = sources.flatMap(({ file, source }) =>
			openingTags(source, "Button")
				.filter((tag) => radii(tag).length > 0)
				.map((tag) => `${file}: ${tag.slice(0, 80)}`),
		);
		expect(offenders).toEqual([]);
	});
});

describe("the scanner itself", () => {
	it("reads a whole tag, past arrows and nested braces", () => {
		const [tag] = openingTags(
			'<button onClick={() => go({ a: 1 })} className="x rounded-control">y</button>',
			"button",
		);
		expect(tag).toBe(
			'<button onClick={() => go({ a: 1 })} className="x rounded-control">',
		);
	});

	it("finds every radius, variants included", () => {
		expect(radii('<Button className="px-3">')).toEqual([]);
		expect(radii('<Button className="rounded-full px-3">')).toEqual([
			"rounded-full",
		]);
		expect(
			radii('<Button className={cn("x", y && "hover:rounded-card")}>'),
		).toEqual(["rounded-card"]);
	});
});
