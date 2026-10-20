import {
	type ExportStatus as ContractExportStatus,
	EXPORT_STATUSES,
} from "avel-server/contract";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
	EXPORT_STATUS_TONE,
	exportStatusTone,
	StatusPill,
	type StatusTone,
} from "@/components/avel/status-pill";
import { tagOf } from "./render-page";

const pill = (tone: StatusTone, extra: Record<string, unknown> = {}) =>
	renderToString(<StatusPill tone={tone} label={`word-${tone}`} {...extra} />);

const TONES: StatusTone[] = ["pass", "block", "warn", "pending", "stale"];

describe("StatusPill", () => {
	for (const tone of TONES) {
		it(`${tone}: the gate triple, a glyph and its word`, () => {
			const html = pill(tone);
			const root = tagOf(html, "status-pill");
			expect(root).toContain(`data-tone="${tone}"`);
			for (const cls of [
				`text-gate-${tone}`,
				`bg-gate-${tone}-soft`,
				`ring-gate-${tone}-line`,
			]) {
				expect(root).toMatch(new RegExp(`(?:"|\\s)${cls}(?:"|\\s)`));
			}
			expect(html).toContain(`>word-${tone}<`);
			expect(html).toMatch(
				/<svg[^>]*aria-hidden="true"[^>]*data-slot="status-glyph"/,
			);
		});
	}

	it("gives each kind of state its own glyph shape, so colour is never alone", () => {
		const centreDot = /<circle cx="6" cy="6" r="2.25" fill="currentColor"/;
		for (const tone of ["pass", "block", "warn"] as const) {
			expect(pill(tone)).toMatch(centreDot); // filled ring
		}
		expect(pill("pending")).not.toMatch(centreDot); // empty ring
		expect(pill("pending")).toMatch(/<circle cx="6" cy="6" r="4.5"/);
		const stale = pill("stale");
		expect(stale).not.toMatch(centreDot);
		expect(stale).not.toMatch(/r="4.5"/); // not a full ring
		expect(stale).toMatch(/<path d="M6 1.5 A4.5 4.5 0 1 0 10.5 6"/); // broken ring
	});

	it("dashes the ring when attested, and only then", () => {
		expect(pill("pass", { attested: true })).toMatch(
			/stroke-dasharray="1.6 1.6"/,
		);
		expect(pill("pass")).not.toContain("stroke-dasharray");
		expect(pill("stale", { attested: true })).toMatch(
			/stroke-dasharray="1.6 1.6"/,
		);
	});

	it("comes in two sizes", () => {
		expect(tagOf(pill("pass", { size: "sm" }), "status-pill")).toMatch(
			/\bh-5\b/,
		);
		expect(tagOf(pill("pass"), "status-pill")).toMatch(/\bh-\[22px\]/);
	});
});

describe("the export status vocabulary (avel-server's contract)", () => {
	it("maps every status to its tone: motion pending, waiting warn, done pass, closed stale, failed block", () => {
		expect(EXPORT_STATUS_TONE).toEqual({
			pending: "pending",
			rendering: "pending",
			verifying: "pending",
			previewing: "pending",
			delivering: "pending",
			previewed: "warn",
			"pr-open": "warn",
			done: "pass",
			closed: "stale",
			failed: "block",
		});
		expect(exportStatusTone("pr-open")).toBe("warn");
		expect(exportStatusTone("failed")).toBe("block");
	});

	it("gives a closed pull request the stale tone: ended, but not a failure (ruling 27)", () => {
		expect(exportStatusTone("closed")).toBe("stale");
	});

	it("has a tone for exactly the contract's statuses, no more and no fewer", () => {
		expect(Object.keys(EXPORT_STATUS_TONE).sort()).toEqual(
			[...EXPORT_STATUSES].sort(),
		);
		// The same, as types: the map's keys are the contract's union.
		const keysAreTheUnion: [keyof typeof EXPORT_STATUS_TONE] extends [
			ContractExportStatus,
		]
			? [ContractExportStatus] extends [keyof typeof EXPORT_STATUS_TONE]
				? true
				: false
			: false = true;
		expect(keysAreTheUnion).toBe(true);
	});
});
