import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Ruling 30, "Stainless Steel": cool steel surfaces, metal suggested by a
// sheen, a top highlight and a brushed grain on the frame only. Every value
// is a token in app.css, and every text and gate colour clears 4.5:1 on
// every surface in both themes, computed here from app.css itself.

const css = readFileSync(
	new URL("../src/styles/app.css", import.meta.url),
	"utf8",
);
const SRC = fileURLToPath(new URL("../src", import.meta.url));
const read = (path: string) => readFileSync(join(SRC, path), "utf8");

function files(dir: string): string[] {
	return readdirSync(dir).flatMap((name) => {
		const path = join(dir, name);
		if (statSync(path).isDirectory()) return files(path);
		return path.endsWith(".tsx") ? [path] : [];
	});
}

/** The body of the first block that starts with `head`. */
function blockOf(head: string): string {
	const start = css.indexOf(head);
	expect(start, head).toBeGreaterThan(-1);
	let depth = 0;
	for (let i = css.indexOf("{", start); i < css.length; i++) {
		if (css[i] === "{") depth++;
		else if (css[i] === "}" && --depth === 0) return css.slice(start, i + 1);
	}
	throw new Error(`unclosed ${head}`);
}

/** Token values in a block, `--name: value;`. */
function tokens(block: string): Map<string, string> {
	return new Map(
		[...block.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)].map((m) => [
			m[1] ?? "",
			(m[2] ?? "").trim(),
		]),
	);
}

const dark = new Map([
	...tokens(blockOf("/* Brand tokens")),
	...tokens(blockOf("/* The Command Center set.")),
]);
const light = new Map([...dark, ...tokens(blockOf(".light {"))]);

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

const lstar = (c: RGBA) => {
	const y = luminance(c);
	return y > 216 / 24389 ? 116 * Math.cbrt(y) - 16 : (y * 24389) / 27;
};

const SURFACES = [
	"app-bg",
	"app-recessed",
	"app-panel",
	"app-band",
	"app-field",
	"app-raised",
	"app-float",
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
	"gate-stale",
];
const OVERLAYS = ["sheen", "state-hover", "state-active", "state-selected"];

describe("the steel palette (ruling 30)", () => {
	for (const [theme, t] of [
		["dark", dark],
		["light", light],
	] as const) {
		const color = (name: string) => parse(t.get(`color-${name}`) ?? "");

		it(`${theme}: every ink clears 4.5:1 on every surface and overlay`, () => {
			const failures: string[] = [];
			for (const surface of SURFACES) {
				const base = color(surface);
				const grounds = [
					[surface, base] as const,
					...OVERLAYS.map(
						(o) => [`${surface}+${o}`, over(color(o), base)] as const,
					),
				];
				for (const ink of INKS) {
					for (const [name, ground] of grounds) {
						const ratio = contrast(color(ink), ground);
						if (ratio < 4.5)
							failures.push(`${ink} on ${name}: ${ratio.toFixed(2)}`);
					}
				}
			}
			expect(failures).toEqual([]);
		});

		it(`${theme}: cool steel, hue 205-225 at low chroma`, () => {
			for (const surface of SURFACES) {
				const [r, g, b] = color(surface);
				// Blue is highest and red lowest: a cool grey, not a neutral or warm one.
				expect(b, surface).toBeGreaterThanOrEqual(g);
				expect(g, surface).toBeGreaterThan(r);
				// Low chroma: the channels stay within 16 of each other.
				expect(b - r, surface).toBeLessThanOrEqual(16);
			}
		});
	}

	it("dark: the canvas sits about 2 L* above the sidebar frame", () => {
		const seam =
			lstar(parse(dark.get("color-app-panel") ?? "")) -
			lstar(parse(dark.get("color-app-bg") ?? ""));
		expect(seam).toBeGreaterThan(1.5);
		expect(seam).toBeLessThan(3);
	});

	it("light: no surface is white", () => {
		for (const surface of SURFACES) {
			expect(light.get(`color-${surface}`)).not.toMatch(/^#f{6}$/i);
		}
	});

	it("keeps the brand accent", () => {
		expect(dark.get("color-accent")).toBe("#0092ca");
	});
});

describe("the metal, as tokens and utilities", () => {
	const METAL = ["sheen", "edge-highlight", "grain", "inset-shadow", "engrave"];

	it("themes each metal token in dark and light", () => {
		const lightOnly = tokens(blockOf(".light {"));
		for (const name of METAL) {
			expect(dark.has(`color-${name}`), name).toBe(true);
			expect(lightOnly.has(`color-${name}`), name).toBe(true);
		}
	});

	it("draws the sheen lighter at the top, gone by two thirds", () => {
		expect(blockOf("@utility sheen {")).toContain(
			"linear-gradient(\n\t\tto bottom,\n\t\tvar(--color-sheen),\n\t\ttransparent 66%\n\t)",
		);
	});

	it("draws the edge as a 1px inset highlight at the top", () => {
		expect(blockOf("@utility edge-highlight {")).toContain(
			"--avel-edge: inset 0 1px 0 var(--color-edge-highlight);",
		);
	});

	it("machined steel is the sheen and the edge together", () => {
		const steel = blockOf("@utility surface-steel {");
		expect(steel).toContain(
			"--avel-edge: inset 0 1px 0 var(--color-edge-highlight);",
		);
		expect(steel).toContain("var(--color-sheen)");
	});

	it("brushes 1px horizontal lines of grain under the sheen", () => {
		const brushed = blockOf("@utility brushed {");
		expect(brushed).toMatch(
			/repeating-linear-gradient\(\s*to bottom,\s*var\(--color-grain\) 0 1px,\s*transparent 1px 3px\s*\)/,
		);
		expect(brushed).toContain("var(--color-sheen)");
	});

	it("sets fields into the surface with an inner shadow", () => {
		expect(blockOf("@utility field-inset {")).toContain(
			"--avel-inset: inset 0 1px 2px var(--color-inset-shadow);",
		);
	});

	it("engraves above in dark and below in light", () => {
		const engraved = blockOf("@utility engraved {");
		expect(engraved).toContain("text-shadow: 0 -1px 0 var(--color-engrave);");
		expect(engraved).toMatch(
			/:where\(\.light\) & \{\s*text-shadow: 0 1px 0 var\(--color-engrave\);/,
		);
	});

	it("composes edge, inset and elevation in any class order", () => {
		for (const name of [
			"shadow-e1",
			"shadow-e2",
			"shadow-e3",
			"edge-highlight",
			"surface-steel",
			"field-inset",
		]) {
			const block = blockOf(`@utility ${name} {`);
			expect(block, name).toMatch(/var\(--avel-edge[,)]/);
			expect(block, name).toMatch(/var\(--avel-inset[,)]/);
			expect(block, name).toMatch(/var\(--avel-elevation|var\(--shadow-e\d\)/);
		}
	});
});

describe("where the steel goes", () => {
	const has = (path: string, fragment: string) =>
		expect(read(path), `${path}: ${fragment}`).toContain(fragment);

	it("machines panels, cards, popovers, menus and dialogs", () => {
		has(
			"components/avel/section-panel.tsx",
			'className="surface-steel groove-b flex items-center justify-between',
		);
		has(
			"components/avel/data-panel.tsx",
			'className="plate overflow-clip rounded-md',
		);
		has(
			"components/avel/surface.tsx",
			"surface-steel rounded-md border border-gate-block-line",
		);
		has("components/ui/popover.tsx", "surface-steel bg-popover p-4");
		has(
			"components/ui/dropdown-menu.tsx",
			"surface-steel rounded-md border border-border-strong bg-popover",
		);
		has(
			"components/ui/select.tsx",
			"surface-steel rounded-md border border-border-strong bg-popover",
		);
		has("components/ui/dialog.tsx", "plate-float rounded-xl");
		has("components/ui/sheet.tsx", "plate-float bg-popover");
		has(
			"components/ui/command.tsx",
			"surface-steel overflow-hidden rounded-lg bg-popover",
		);
	});

	it("makes a panel a plate: edge, rim, shade, ledge and a body above the canvas (ruling 37)", () => {
		const css = read("styles/app.css");
		const plate = css.slice(
			css.indexOf("@utility plate {"),
			css.indexOf("@utility plate-float {"),
		);
		for (const part of [
			"--color-border-plate",
			"--color-app-plate",
			"--color-plate-rim",
			"--color-plate-shade",
			"--color-plate-ledge",
			"--color-plate-sheen",
			"--shadow-e1",
		]) {
			expect(plate, part).toContain(part);
		}
		has(
			"components/avel/section-panel.tsx",
			'"plate overflow-hidden rounded-md border"',
		);
		has("components/avel/action-modal.tsx", "plate-float bg-popover");
	});

	it("brushes the top bar, and catches the light on its edge and the canvas's", () => {
		has("shell/page.tsx", "brushed edge-highlight h-(--topbar-height)");
		has(
			"shell/app-shell.tsx",
			'className="edge-highlight flex min-w-0 flex-1 flex-col overflow-hidden bg-card',
		);
	});

	it("brushes only the frame: the sidebar and the top bar", () => {
		const using = files(SRC)
			.filter((path) =>
				/(?<=["\s])brushed(?=[\s"])/.test(readFileSync(path, "utf8")),
			)
			.map((path) => relative(SRC, path).replaceAll("\\", "/"))
			.sort();
		expect(using).toEqual(["shell/page.tsx", "shell/sidebar.tsx"]);
	});

	it("sets fields flat and inset, never sheened", () => {
		for (const path of [
			"components/ui/input.tsx",
			"components/ui/textarea.tsx",
			"components/ui/select.tsx",
		]) {
			has(path, "field-inset");
		}
		for (const path of [
			"components/ui/input.tsx",
			"components/ui/textarea.tsx",
		]) {
			expect(read(path)).not.toMatch(/surface-steel|\bsheen\b/);
		}
	});

	it("machines secondary and outline buttons, and keeps the primary solid", () => {
		const button = read("components/ui/button.tsx");
		expect(button).toMatch(/outline:\s*"surface-steel /);
		expect(button).toMatch(/secondary:\s*"surface-steel /);
		expect(button).toMatch(
			/default:\s*"bg-primary text-primary-foreground hover/,
		);
	});
});
