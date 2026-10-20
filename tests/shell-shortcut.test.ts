import { describe, expect, it } from "vitest";
import { isTypingTarget } from "@/shell/shortcut";

/*
 * Which key presses are text and which are shortcuts (G F, audit F6). The
 * tests run without a DOM, so a target is faked by its shape: what
 * `closest` finds above it, and whether it is contenteditable.
 */

type Fake = {
	/** The selectors `closest` matches, each to what it finds. */
	inside?: { field?: boolean; dialog?: { allowShortcuts: boolean } };
	isContentEditable?: boolean;
};

function target({ inside = {}, isContentEditable = false }: Fake) {
	const dialog = inside.dialog
		? {
				hasAttribute: (name: string) =>
					name === "data-allow-shortcuts" &&
					Boolean(inside.dialog?.allowShortcuts),
			}
		: null;
	return {
		isContentEditable,
		closest: (selector: string) =>
			selector === "[role=dialog]"
				? dialog
				: selector === "input, textarea, select" && inside.field
					? {}
					: null,
	} as unknown as EventTarget;
}

describe("isTypingTarget", () => {
	it("takes a key on the page as a shortcut", () => {
		expect(isTypingTarget(target({}))).toBe(false);
	});

	it("leaves a key in a field or a contenteditable as text", () => {
		expect(isTypingTarget(target({ inside: { field: true } }))).toBe(true);
		expect(isTypingTarget(target({ isContentEditable: true }))).toBe(true);
	});

	it("leaves a key in any other dialog as text", () => {
		expect(
			isTypingTarget(target({ inside: { dialog: { allowShortcuts: false } } })),
		).toBe(true);
	});

	it("lets the mission details sheet take G F, but not from a field inside it", () => {
		const sheet = { dialog: { allowShortcuts: true } };
		expect(isTypingTarget(target({ inside: sheet }))).toBe(false);
		expect(isTypingTarget(target({ inside: { ...sheet, field: true } }))).toBe(
			true,
		);
	});

	it("ignores a target that is not an element", () => {
		expect(isTypingTarget(null)).toBe(false);
		expect(isTypingTarget({} as EventTarget)).toBe(false);
	});
});

describe("the mission details sheet", () => {
	it("marks itself as taking shortcuts", async () => {
		const { readFileSync } = await import("node:fs");
		// The sheet portals, so it is read from the source rather than rendered.
		const source = readFileSync(
			"src/components/avel/mission-details.tsx",
			"utf8",
		);
		expect(source).toMatch(
			/data-testid="mission-details"[\s\S]{0,200}data-allow-shortcuts=""/,
		);
	});
});
