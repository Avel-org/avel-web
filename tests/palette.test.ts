import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Design system v3 (ruling 50): every text and status colour clears 4.5:1
// on every surface it sits on, in both themes, computed here from app.css
// itself. Where v3's own values fall short, the pair is listed by name below,
// so a new shortfall fails and a fixed one has to be taken off the list.

const css = readFileSync(
	new URL("../src/styles/app.css", import.meta.url),
	"utf8",
).replace(/\/\*[\s\S]*?\*\//g, "");

function blockOf(head: string): string {
	const start = css.indexOf(`${head} {`);
	expect(start, head).toBeGreaterThan(-1);
	let depth = 0;
	for (let i = css.indexOf("{", start); i < css.length; i++) {
		if (css[i] === "{") depth++;
		else if (css[i] === "}" && --depth === 0) return css.slice(start, i);
	}
	throw new Error(`unclosed ${head}`);
}

const colors = (block: string) =>
	new Map(
		[...block.matchAll(/--color-([a-z0-9-]+):\s*([^;]+);/g)].map((m) => [
			m[1] ?? "",
			(m[2] ?? "").trim(),
		]),
	);

const light = colors(blockOf("@theme static"));
const dark = new Map([...light, ...colors(blockOf(".dark"))]);

// --- Colour arithmetic (WCAG 2.x relative luminance) -------------------------

type RGBA = [number, number, number, number];

function parse(value: string): RGBA {
	const hex = /^#([0-9a-f]{6})$/i.exec(value);
	if (hex?.[1]) {
		const n = Number.parseInt(hex[1], 16);
		return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
	}
	const rgb = /^rgb\((\d+) (\d+) (\d+) \/ ([\d.]+)\)$/.exec(value);
	if (rgb)
		return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3]), Number(rgb[4])];
	throw new Error(`not a colour: ${value}`);
}

const over = (top: RGBA, base: RGBA): RGBA => [
	top[0] * top[3] + base[0] * (1 - top[3]),
	top[1] * top[3] + base[1] * (1 - top[3]),
	top[2] * top[3] + base[2] * (1 - top[3]),
	1,
];

function luminance([r, g, b]: RGBA): number {
	const lin = (v: number) => {
		const c = v / 255;
		return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
	};
	return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(a: RGBA, b: RGBA): number {
	const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
	return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
}

/** Surfaces text sits on. The canvas is behind the frame and holds none. */
const SURFACES = [
	"app-bg",
	"app-panel",
	"app-band",
	"app-well",
	"app-hollow",
	"field-fill",
	"composer",
	"app-raised",
	"app-float",
	"selected",
	"chip",
];
const INKS = [
	"text",
	"text-muted",
	"text-subtle",
	"accent-text",
	"gate-pass",
	"gate-block",
	"gate-warn",
	"gate-pending",
];

/**
 * Pairs that measure under 4.5:1. Reported to the operator (2026-10-19), not
 * fixed here: the palette is theirs to change. The solid surfaces
 * (2026-10-21) deepened light's inks to clear the warm grey; subtle text on
 * a light well or hover row stays short (4.3:1), as on v3's raised before.
 */
const KNOWN_SHORT = {
	light: ["text-subtle on app-well", "text-subtle on app-raised"],
	dark: ["text-subtle on selected"],
};

describe("v3 contrast, from app.css", () => {
	for (const [theme, t] of [
		["light", light],
		["dark", dark],
	] as const) {
		const base = parse(t.get("app-panel") ?? "");
		const color = (name: string): RGBA => {
			const value = t.get(name);
			expect(value, `${theme} --color-${name}`).toBeDefined();
			const c = parse(value ?? "");
			return c[3] < 1 ? over(c, base) : c;
		};

		it(`${theme}: every ink clears 4.5:1 on every surface, but the listed pairs`, () => {
			const short: string[] = [];
			for (const ink of INKS)
				for (const surface of SURFACES)
					if (contrast(color(ink), color(surface)) < 4.5)
						short.push(`${ink} on ${surface}`);
			expect(short).toEqual(KNOWN_SHORT[theme]);
		});

		it(`${theme}: each status tone reads on its own soft ground and the warn banner`, () => {
			for (const tone of ["pass", "block", "warn", "pending"])
				expect(
					contrast(color(`gate-${tone}`), color(`gate-${tone}-soft`)),
					tone,
				).toBeGreaterThanOrEqual(4.5);
			expect(
				contrast(color("gate-warn"), color("gate-warn-banner")),
			).toBeGreaterThanOrEqual(4.5);
		});

		it(`${theme}: control edges and the focus ring clear 3:1 where controls sit`, () => {
			// v3 measures the control edge on white: panels, fields, menus.
			for (const surface of ["app-panel", "field-fill", "app-float"])
				expect(
					contrast(color("border-control"), color(surface)),
					`border-control on ${surface}`,
				).toBeGreaterThanOrEqual(3);
			for (const surface of ["app-panel", "app-bg", "field-fill"])
				expect(
					contrast(color("focus-ring"), color(surface)),
					`focus-ring on ${surface}`,
				).toBeGreaterThanOrEqual(3);
			// One solid surface: the frame is the page, so a control edge
			// clears 3:1 there too (light's was 2.9:1 on the old frame).
			expect(
				contrast(color("border-control"), color("app-bg")),
				"border-control on app-bg",
			).toBeGreaterThanOrEqual(3);
		});
	}

	it("paints the window with the dark canvas when the wrapper is dark", () => {
		// .dark sits below <body>, so the window repeats the token's value;
		// this keeps the copy from drifting.
		const rule =
			/html:has\(\.app\.dark\),\s*html:has\(\.app\.dark\) body \{\s*background: ([^;]+);/.exec(
				css,
			);
		expect(rule?.[1]).toBe(dark.get("app-canvas"));
	});

	it("records the primary label's exception as measured (audit D8)", () => {
		// White on the gradient: 2.1:1 at the top, 3.2:1 at the bottom. The
		// audit estimated 3.2-3.5:1; the top of the gradient measures lower.
		const label = parse(light.get("text-on-solid") ?? "");
		const at = (stop: string) =>
			contrast(label, parse(light.get(stop) ?? "")).toFixed(1);
		expect([at("btn-primary-top"), at("btn-primary-bottom")]).toEqual([
			"2.1",
			"3.2",
		]);
	});

	it("selects text with its own colour, strong enough to find in dark", () => {
		expect(css).toMatch(
			/::selection \{\s*background: var\(--color-text-selection\);/,
		);
		// accent-soft, the old selection, was 0.13 over the dark panel.
		expect(parse(dark.get("text-selection") ?? "")[3]).toBeGreaterThan(0.3);
		expect(light.get("text-selection")).toBeDefined();
	});

	it("keeps dark's status lines quiet: no pill rim above 0.3", () => {
		for (const tone of ["pass", "block", "warn", "pending"])
			expect(
				parse(dark.get(`gate-${tone}-line`) ?? "")[3],
				tone,
			).toBeLessThanOrEqual(0.3);
	});

	it("lifts a dark field over its surface, and rings it in a mid blue", () => {
		// An opaque near-black fill sank into a pit, deepest in a popover. A
		// translucent white lift reads the same on every surface it sits on.
		const [r, g, b, a] = parse(dark.get("field-fill") ?? "");
		expect([r, g, b]).toEqual([255, 255, 255]);
		expect(a).toBeLessThan(0.06);
		expect(parse(dark.get("field-fill-focus") ?? "")[3]).toBeGreaterThan(a);
		// The shared pale ring glared round a whole field; the field's own
		// edge is a deeper blue that still clears 3:1 wherever a field sits.
		const ring = parse(dark.get("field-focus") ?? "");
		expect(ring).not.toEqual(parse(dark.get("focus-ring") ?? ""));
		for (const surface of ["app-panel", "app-band", "app-float", "app-bg"])
			expect(
				contrast(ring, parse(dark.get(surface) ?? "")),
				surface,
			).toBeGreaterThanOrEqual(3);
		// The old shared halo was 0.32 of the pale ring.
		expect(parse(dark.get("field-halo") ?? "")[3]).toBeLessThanOrEqual(0.2);
		// Light lifts a step toward the panel when focused, in the shared ring.
		expect(light.get("field-fill-focus")).toBe("#f8f7f6");
		expect(light.get("field-focus")).toBe(light.get("focus-ring"));
	});

	it("deepens the primary gradient in dark, so its label reads better than light's", () => {
		// The light gradient on the dark panel read as a glare: 2.1:1 at the
		// top. Dark's own stops: 2.9:1 at the top, 4.7:1 at the bottom.
		const label = parse(dark.get("text-on-solid") ?? "");
		const at = (stop: string) =>
			contrast(label, parse(dark.get(stop) ?? "")).toFixed(1);
		expect([at("btn-primary-top"), at("btn-primary-bottom")]).toEqual([
			"2.9",
			"4.7",
		]);
	});

	it("records the danger confirm's label as measured, and keeps the face to one variant (audit D7)", () => {
		// White on the coral gradient: 3.0:1 at the top, 4.1:1 at the bottom.
		const label = parse(light.get("text-on-solid") ?? "");
		const at = (stop: string) =>
			contrast(label, parse(light.get(stop) ?? "")).toFixed(1);
		expect([at("btn-danger-top"), at("btn-danger-bottom")]).toEqual([
			"3.0",
			"4.1",
		]);
		// The filled danger is one Button variant, so it can only be placed on
		// purpose: never a plain class in a component.
		const button = readFileSync(
			new URL("../src/components/ui/button.tsx", import.meta.url),
			"utf8",
		);
		expect(button).toContain('"destructive-confirm": "btn-danger-face"');
	});
});
