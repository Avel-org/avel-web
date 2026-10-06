import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The type system as app.css defines it (ruling 30): one family, IBM Plex
// Sans for prose and headings and IBM Plex Mono for machine text, at the
// steel scale's sizes with tracking tuned for Plex.
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

describe("one family: IBM Plex Sans and IBM Plex Mono", () => {
	it("imports Plex Sans (variable) and Plex Mono's two weights, and no other face", () => {
		const imports = [...css.matchAll(/@import "(@fontsource[^"]+)"/g)].map(
			(m) => m[1],
		);
		expect(imports).toEqual([
			"@fontsource-variable/ibm-plex-sans",
			"@fontsource/ibm-plex-mono/400.css",
			"@fontsource/ibm-plex-mono/500.css",
		]);
	});

	it("installs only those faces", () => {
		expect(
			Object.keys(pkg.dependencies).filter((name) =>
				name.startsWith("@fontsource"),
			),
		).toEqual([
			"@fontsource-variable/ibm-plex-sans",
			"@fontsource/ibm-plex-mono",
		]);
	});

	it("sets display and sans to Plex Sans, and mono to Plex Mono", () => {
		expect(css).toContain(
			'--font-display: "IBM Plex Sans Variable", system-ui, sans-serif;',
		);
		expect(css).toContain(
			'--font-sans: "IBM Plex Sans Variable", system-ui, sans-serif;',
		);
		expect(css).toContain(
			'--font-mono: "IBM Plex Mono", ui-monospace, monospace;',
		);
	});

	it("drops Geist, and every earlier face", () => {
		expect(css).not.toMatch(
			/Geist|--font-emphasis|Fraunces|Space Grotesk|Inter Variable/,
		);
	});
});

describe("the type scale, ruling 30's sizes for Plex", () => {
	// [utility, size, line height, tracking]: in px, display 33/40, h1 25/32,
	// h2 19/26, panel title 15/22, body 15/22, small 14/20, caption 12.5/16,
	// mono 13.5/20.
	const SCALE: [string, string, string, string | null][] = [
		["type-display", "2.0625rem", "2.5rem", "-0.01em"],
		["type-h1", "1.5625rem", "2rem", "-0.01em"],
		["type-h2", "1.1875rem", "1.625rem", "-0.01em"],
		["type-panel-title", "0.9375rem", "1.375rem", "-0.005em"],
		["type-body", "0.9375rem", "1.375rem", "0"],
		["type-small", "0.875rem", "1.25rem", "0"],
		["type-caption", "0.78125rem", "1rem", "0"],
		["type-mono", "0.84375rem", "1.25rem", null],
		["type-mono-small", "0.78125rem", "1rem", null],
	];

	for (const [name, size, lineHeight, tracking] of SCALE) {
		it(`${name}: ${size} on ${lineHeight}${tracking ? `, tracked ${tracking}` : ""}`, () => {
			const block = utility(name);
			expect(block).toContain(`font-size: ${size};`);
			expect(block).toContain(`line-height: ${lineHeight};`);
			if (tracking) expect(block).toContain(`letter-spacing: ${tracking};`);
		});
	}

	it("keeps machine text tabular, in Plex Mono", () => {
		for (const name of ["type-mono", "type-mono-small"]) {
			expect(utility(name)).toContain("font-family: var(--font-mono);");
			expect(utility(name)).toContain("font-variant-numeric: tabular-nums;");
		}
	});
});
