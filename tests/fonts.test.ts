import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The type system as app.css defines it (design system v3, ruling 50): Inter
// for prose and headings, IBM Plex Mono for machine text, and nine roles.
// Tailwind's own sizes and families are cleared, so only these exist.
const css = readFileSync(
	new URL("../src/styles/app.css", import.meta.url),
	"utf8",
);
const pkg = JSON.parse(
	readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as { dependencies: Record<string, string> };

/** The declarations inside one @utility block. */
function utility(name: string): string {
	const start = css.indexOf(`@utility ${name} {`);
	expect(start, name).toBeGreaterThan(-1);
	return css.slice(start, css.indexOf("}", start));
}

describe("Inter and IBM Plex Mono", () => {
	it("imports Inter (variable) and Plex Mono's two weights, and no other face", () => {
		const imports = [...css.matchAll(/@import "(@fontsource[^"]+)"/g)].map(
			(m) => m[1],
		);
		expect(imports).toEqual([
			"@fontsource-variable/inter",
			"@fontsource/ibm-plex-mono/400.css",
			"@fontsource/ibm-plex-mono/500.css",
		]);
	});

	it("installs only those faces", () => {
		expect(
			Object.keys(pkg.dependencies).filter((name) =>
				name.startsWith("@fontsource"),
			),
		).toEqual(["@fontsource-variable/inter", "@fontsource/ibm-plex-mono"]);
	});

	it("sets sans to Inter and mono to Plex Mono, and clears every other family", () => {
		expect(css).toContain("--font-*: initial;");
		expect(css).toContain(
			'--font-sans: "Inter Variable", ui-sans-serif, system-ui, sans-serif;',
		);
		expect(css).toContain(
			'--font-mono: "IBM Plex Mono", ui-monospace, "SFMono-Regular", monospace;',
		);
		expect(css).not.toMatch(/--font-display|IBM Plex Sans|Geist|Space Grotesk/);
	});

	it("sets the body at 14/20 and leaves the root at 16px, which every rem reads", () => {
		expect(css).toMatch(
			/\nbody \{\s*font-size: 14px;\s*line-height: 20px;\s*\}/,
		);
		// A font-size on html would shrink every rem in the app by 12.5%.
		const root = /\nhtml,\s*body \{([^}]*)\}/.exec(css)?.[1] ?? "";
		expect(root).not.toContain("font-size");
		expect(css).toContain('font-feature-settings: "cv11", "ss03";');
	});
});

describe("the v3 type roles", () => {
	// [utility, size, line height, weight, tracking]: in px, display 24/32
	// at 650, page 18/26 at 620, title 15/22 at 550, body 14/20, small 13/18,
	// caption 12/16, eyebrow 11/16 at 600, metric 22/28 at 600, mono 12.5/18.
	const ROLES: [string, string, string, string | null, string | null][] = [
		["type-display", "1.5rem", "2rem", "650", "-0.02em"],
		["type-page", "1.125rem", "1.625rem", "620", "-0.012em"],
		["type-title", "0.9375rem", "1.375rem", "550", "-0.006em"],
		["type-body", "0.875rem", "1.25rem", "400", "0"],
		["type-small", "0.8125rem", "1.125rem", "400", "0"],
		["type-caption", "0.75rem", "1rem", "400", "0"],
		["type-eyebrow", "0.6875rem", "1rem", "600", "0.07em"],
		["type-metric", "1.375rem", "1.75rem", "600", null],
		["type-mono", "0.78125rem", "1.125rem", null, null],
	];

	for (const [name, size, lineHeight, weight, tracking] of ROLES) {
		it(`${name}: ${size} on ${lineHeight}`, () => {
			const block = utility(name);
			expect(block).toContain(`font-size: ${size};`);
			expect(block).toContain(`line-height: ${lineHeight};`);
			if (weight) expect(block).toContain(`font-weight: ${weight};`);
			if (tracking) expect(block).toContain(`letter-spacing: ${tracking};`);
		});
	}

	it("clears Tailwind's text sizes, so only the roles exist", () => {
		expect(css).toContain("--text-*: initial;");
	});

	it("labels sections in uppercase only through the eyebrow", () => {
		expect(utility("type-eyebrow")).toContain("text-transform: uppercase;");
		const uppercase = [...css.matchAll(/text-transform: uppercase;/g)];
		expect(uppercase).toHaveLength(1);
	});

	it("keeps numbers and machine text tabular", () => {
		for (const name of ["type-mono", "type-metric", "type-caption"])
			expect(utility(name)).toContain("font-variant-numeric: tabular-nums;");
		expect(utility("type-mono")).toContain("font-family: var(--font-mono);");
	});
});
