import { EXPORT_STATUSES } from "avel-server/contract";
import { describe, expect, it } from "vitest";
import {
	coverage,
	EXPORT_PHASE,
	IN_FLIGHT_STATUSES,
	QUIET_AFTER_DAYS,
	quietBefore,
	quietDays,
	quietText,
} from "@/components/avel/mission-watch";

const NOW = Date.parse("2026-10-06T12:00:00.000Z");
const daysAgo = (days: number) =>
	new Date(NOW - days * 86_400_000).toISOString();

describe("which exports are in flight", () => {
	it("places every export status the contract has, and no others", () => {
		expect(Object.keys(EXPORT_PHASE).sort()).toEqual(
			[...EXPORT_STATUSES].sort(),
		);
	});

	it("counts the pipeline at work as moving, and a person's turn as waiting", () => {
		expect(
			EXPORT_STATUSES.filter((status) => EXPORT_PHASE[status] === "moving"),
		).toEqual(["rendering", "verifying", "previewing", "delivering"]);
		expect(
			EXPORT_STATUSES.filter((status) => EXPORT_PHASE[status] === "waiting"),
		).toEqual(["previewed", "pr-open"]);
	});

	it("leaves out an export that has not started or is over", () => {
		for (const status of ["pending", "done", "closed", "failed"] as const) {
			expect(EXPORT_PHASE[status]).toBeNull();
		}
	});
});

describe("going quiet", () => {
	it("starts at three days, a constant for now", () => {
		expect(QUIET_AFTER_DAYS).toBe(3);
	});

	it("counts whole days without activity", () => {
		expect(quietDays(daysAgo(4), NOW)).toBe(4);
		expect(quietDays(daysAgo(2.9), NOW)).toBe(2);
		expect(quietDays(null, NOW)).toBeNull();
	});

	it("says how long, or that there has been none", () => {
		expect(quietText(daysAgo(4), NOW)).toBe("No activity for 4 days");
		expect(quietText(daysAgo(1), NOW)).toBe("No activity for 1 day");
		expect(quietText(null, NOW)).toBe("No activity yet");
	});
});

describe("asking the server", () => {
	it("asks for exactly the moving and waiting statuses", () => {
		expect([...IN_FLIGHT_STATUSES].sort()).toEqual([
			"delivering",
			"pr-open",
			"previewed",
			"previewing",
			"rendering",
			"verifying",
		]);
	});

	it("draws the quiet line three days back, rounded down to the hour", () => {
		expect(quietBefore(Date.parse("2026-10-06T12:34:56.000Z"))).toBe(
			"2026-10-03T12:00:00.000Z",
		);
		// The same key for the whole hour, so the strip does not refetch each minute.
		expect(quietBefore(Date.parse("2026-10-06T12:59:00.000Z"))).toBe(
			quietBefore(Date.parse("2026-10-06T12:01:00.000Z")),
		);
	});

	it("says how many there are only when there are more than it shows", () => {
		expect(coverage(5, 12)).toBe("Showing 5 of 12");
		expect(coverage(3, 3)).toBeNull();
		expect(coverage(0, undefined)).toBeNull();
	});
});
