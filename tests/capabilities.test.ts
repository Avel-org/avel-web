import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { NOT_YET } from "@/lib/capabilities";

// Audit F9: one source for "can't do this yet" copy. Every place that says
// New mission is unavailable reads NOT_YET, so the page button and the
// command menu entry cannot drift apart again.

const read = (path: string) =>
	readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");

const PLACES = ["routes/missions.tsx", "shell/command-palette.tsx"];

describe("not-yet capabilities", () => {
	it("each has one plain sentence", () => {
		for (const reason of Object.values(NOT_YET)) {
			expect(reason).toMatch(/^[A-Z][^.]*\.$/);
		}
	});

	it("New mission's reason comes from NOT_YET in every place it shows", () => {
		for (const path of PLACES) {
			const source = read(path);
			expect(source, path).toContain('NOT_YET["mission.create"]');
			// No copy of its own, in either wording that drifted before.
			expect(source, path).not.toContain(NOT_YET["mission.create"]);
			expect(source, path).not.toContain("Needs mission.create");
		}
	});
});
