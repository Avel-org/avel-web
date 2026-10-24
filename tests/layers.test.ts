import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The stacking order, read from app.css. A select, menu, popover or tooltip
// opened inside a dialog must draw over the dialog: at --z-popover under
// --z-modal, a select in Add connection opened behind the dialog's scrim
// and could not be chosen (live check, 2026-10-24).

const css = readFileSync(
	new URL("../src/styles/app.css", import.meta.url),
	"utf8",
);

const layer = (name: string) => {
	const m = new RegExp(String.raw`--z-${name}:\s*(\d+);`).exec(css);
	expect(m, name).not.toBeNull();
	return Number(m?.[1]);
};

describe("the stacking order", () => {
	it("draws popups over dialogs, and toasts over both", () => {
		expect(layer("dock")).toBeLessThan(layer("modal"));
		expect(layer("popover")).toBeGreaterThan(layer("modal"));
		expect(layer("toast")).toBeGreaterThan(layer("popover"));
	});
});
