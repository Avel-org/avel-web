import type { MissionDetail } from "avel-server/contract";
import { describe, expect, it } from "vitest";
import { approveFieldOf } from "@/components/avel/intake-modals";
import {
	parseSpendLimit,
	SpendLimitControl,
	spendLimitHeld,
} from "@/components/avel/spend-limit";
import { render } from "./canon-fixtures";
import { tagOf } from "./render-page";

/*
 * A mission's spend limit (avel-server's PATCH /api/missions/:id and the
 * approve body): what the field accepts, when Save is held, and where the
 * control shows.
 */

const mission = (over: Partial<MissionDetail>) =>
	({
		id: "00000000-0000-4000-8000-00000000d001",
		status: "draft",
		spendCeilingUsd: null,
		spentUsd: 0,
		...over,
	}) as MissionDetail;

describe("the spend limit field", () => {
	it("is empty until typed, and takes dollars with a $ or commas", () => {
		expect(parseSpendLimit("  ")).toBeNull();
		expect(parseSpendLimit("$1,250.50")).toEqual({ value: 1250.5 });
	});

	it("refuses what the contract refuses, saying why", () => {
		expect(parseSpendLimit("abc")).toEqual({
			problem: "Give the limit in dollars.",
		});
		expect(parseSpendLimit("0")).toEqual({ problem: "Give a limit above $0." });
		expect(parseSpendLimit("1000001")).toEqual({
			problem: "The most a limit can be is $1,000,000.",
		});
		expect(parseSpendLimit("10.005")).toEqual({
			problem: "Give the limit in whole cents.",
		});
	});

	it("holds Save on an active mission's lower limit, but not a draft's", () => {
		const lower = parseSpendLimit("100");
		expect(
			spendLimitHeld(
				lower,
				mission({ status: "active", spendCeilingUsd: 500 }),
			),
		).toMatch(/can only go up/);
		expect(
			spendLimitHeld(lower, mission({ status: "draft", spendCeilingUsd: 500 })),
		).toBeUndefined();
		expect(
			spendLimitHeld(parseSpendLimit("500"), mission({ spendCeilingUsd: 500 })),
		).toBe("That is the limit already.");
	});

	it("lets an empty field remove a draft's limit, never an active mission's", () => {
		const empty = parseSpendLimit("");
		expect(
			spendLimitHeld(empty, mission({ status: "draft", spendCeilingUsd: 500 })),
		).toBeUndefined();
		expect(
			spendLimitHeld(
				empty,
				mission({ status: "active", spendCeilingUsd: 500 }),
			),
		).toMatch(/can't be removed/);
		expect(spendLimitHeld(empty, mission({ spendCeilingUsd: null }))).toBe(
			"Give the limit.",
		);
	});

	it("puts the server's issue on the Approve dialog's limit field", () => {
		expect(approveFieldOf(["spendCeilingUsd"])).toBe("spendCeilingUsd");
	});
});

describe("the Spend panel's control", () => {
	it("offers to set a limit on a draft with none, never as the primary: it is optional", async () => {
		const html = await render(<SpendLimitControl mission={mission({})} />);
		expect(html).toContain("Set spend limit");
		expect(tagOf(html, "mission-spend-limit-open")).toContain(
			'data-variant="outline"',
		);
	});

	it("offers a change while active, and nothing once halted or shipped", async () => {
		expect(
			await render(
				<SpendLimitControl
					mission={mission({ status: "active", spendCeilingUsd: 500 })}
				/>,
			),
		).toContain("Change spend limit");
		for (const status of ["halted", "shipped"] as const) {
			expect(
				await render(<SpendLimitControl mission={mission({ status })} />),
			).not.toContain("mission-spend-limit-open");
		}
	});
});
