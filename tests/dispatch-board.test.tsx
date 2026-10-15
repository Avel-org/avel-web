import {
	DISPATCH_STATUSES,
	type Dispatch,
	type DispatchStatus,
	dispatch as dispatchShape,
	HALT_REASONS,
	type HaltReason,
} from "avel-server/contract";
import type { ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
	DISPATCH_LANES,
	DispatchBoard,
	DispatchCard,
	isOpenLane,
	laneOrder,
} from "@/components/avel/dispatch-board";
import { briefLineTones } from "@/components/avel/dispatch-brief";
import {
	DispatchBudget,
	formatUsd,
	MissionSpendBar,
	minutesRun,
	multipleOf,
} from "@/components/avel/dispatch-budget";
import {
	DISPATCH_STATUS_LABEL,
	HALT_REASON_LABEL,
} from "@/components/avel/dispatch-labels";
import { TooltipProvider } from "@/components/ui/tooltip";
import { tagOf } from "./render-page";
import { UUID_FRAGMENT, visibleText } from "./visible-text";

/*
 * Module 6, F3: the dispatch board and its budget. Not mounted yet (the
 * routes arrive in step 4), so it renders from fixtures typed and parsed by
 * the contract: every status, every halt reason, a soft crossing.
 */

/** From an element's opening tag to its matching close. */
function element(html: string, testid: string): string {
	const at = html.indexOf(`data-testid="${testid}"`);
	expect(at, testid).toBeGreaterThan(-1);
	const start = html.lastIndexOf("<", at);
	const name = /^<([a-z0-9]+)/.exec(html.slice(start))?.[1] ?? "";
	const re = new RegExp(`<${name}[\\s>]|</${name}>`, "g");
	re.lastIndex = start;
	let depth = 0;
	for (let m = re.exec(html); m; m = re.exec(html)) {
		depth += m[0].startsWith("</") ? -1 : 1;
		if (depth === 0) return html.slice(start, re.lastIndex);
	}
	return html.slice(start);
}

const tip = (node: ReactNode) =>
	renderToString(<TooltipProvider>{node}</TooltipProvider>);
const text = (html: string) => visibleText(html).trim();

const SHA = "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08";
const SKILLS =
	"2c26b46b68ffc68ff99b453c1d30413413422d706483bfa0f98a5e886266e7ae";
const MISSION = "3fcd1ce4-5eed-4000-8000-000000000036";
/** 14:00 UTC on 12 Oct; a running dispatch started at 13:48 has run 12 min. */
const NOW = Date.parse("2026-10-12T14:00:00.000Z");

let n = 0;
/** A contract-parsed dispatch: started and closed as its status implies. */
function dispatch(
	status: DispatchStatus,
	over: Partial<Dispatch> = {},
): Dispatch {
	n += 1;
	const id = `d15a7c${String(n).padStart(2, "0")}-5eed-4000-8000-0000000000${String(n).padStart(2, "0")}`;
	const queued = status === "queued";
	const closed = !queued && status !== "running";
	const value: Dispatch = {
		id,
		missionId: MISSION,
		rosterEntryId: `e0e0e0${String(n).padStart(2, "0")}-5eed-4000-8000-000000000001`,
		agent: {
			templateId: "a7a5a7a5-5eed-4000-8000-000000000001",
			slug: "atlas",
			name: "Atlas",
			title: "Domain modeller",
		},
		territory: "src/billing/**",
		briefRef: { moduleId: "M3", requirementIds: ["R-12", "R-14"] },
		status,
		haltReason: status === "halted" ? "token_hard_ceiling" : null,
		estimatedTokens: 40_000,
		tokenSoftCeiling: 60_000,
		tokenHardCeiling: 120_000,
		softCeilingCrossed: false,
		tokensUsed: queued ? 0 : 24_000,
		tokensIn: queued ? 0 : 15_000,
		tokensOut: queued ? 0 : 5_000,
		cacheReadTokens: queued ? 0 : 3_000,
		cacheWriteTokens: queued ? 0 : 1_000,
		spendUsd: queued ? 0 : 0.0421,
		wallClockMinutes: 45,
		agentVersionSha256: queued ? null : SHA,
		agentVersionRef: queued ? null : "atlas@v3",
		skillsSha256: queued ? null : SKILLS,
		model: queued ? null : "claude-opus-5-5",
		briefSha256: null,
		harnessVersion: null,
		reportId: closed
			? `4e904e90-5eed-4000-8000-0000000000${String(n).padStart(2, "0")}`
			: null,
		startedAt: queued ? null : "2026-10-12T13:48:00.000Z",
		closedAt: closed ? "2026-10-12T13:58:00.000Z" : null,
		createdAt: "2026-10-12T13:40:00.000Z",
		updatedAt: "2026-10-12T13:58:00.000Z",
		...over,
	};
	return dispatchShape.parse(value);
}

const ONE_OF_EACH = DISPATCH_STATUSES.map((s) => dispatch(s));
const HALTS = HALT_REASONS.map((reason) =>
	dispatch("halted", { haltReason: reason }),
);

describe("the dispatch board", () => {
	it("lays out every status as a lane: open ones first, then closed", () => {
		expect([...DISPATCH_LANES].sort()).toEqual([...DISPATCH_STATUSES].sort());
		expect(DISPATCH_LANES).toEqual([
			"queued",
			"running",
			"blocked",
			"complete",
			"failed",
			"halted",
		]);
		expect(DISPATCH_LANES.filter(isOpenLane)).toEqual([
			"queued",
			"running",
			"blocked",
		]);
		const html = tip(<DispatchBoard dispatches={ONE_OF_EACH} now={NOW} />);
		const open = element(html, "dispatch-board-open");
		const closed = element(html, "dispatch-board-closed");
		const headings = (region: string) =>
			[...region.matchAll(/<h3[^>]*>([^<]+)<\/h3>/g)].map((m) => m[1]);
		expect(headings(open)).toEqual(["Waiting to start", "Running", "Blocked"]);
		expect(headings(closed)).toEqual(["Complete", "Failed", "Halted"]);
		for (const s of DISPATCH_STATUSES) {
			expect(headings(html)).toContain(DISPATCH_STATUS_LABEL[s]);
		}
	});

	it("files each dispatch in its status's lane and counts it", () => {
		const html = tip(
			<DispatchBoard
				dispatches={[...ONE_OF_EACH, dispatch("running")]}
				now={NOW}
			/>,
		);
		for (const d of ONE_OF_EACH) {
			const lane = element(html, `dispatch-lane-${d.status}`);
			expect(lane).toContain(`data-testid="dispatch-card-${d.id}"`);
			expect(tagOf(html, `dispatch-card-${d.id}`)).toContain(
				`data-status="${d.status}"`,
			);
		}
		expect(text(element(html, "dispatch-lane-running-count"))).toBe("2");
		expect(text(element(html, "dispatch-lane-queued-count"))).toBe("1");
	});

	it("says a lane is empty in words", () => {
		const html = tip(<DispatchBoard dispatches={[]} now={NOW} />);
		for (const s of DISPATCH_STATUSES) {
			expect(text(element(html, `dispatch-lane-${s}-count`))).toBe("0");
			expect(html).toContain(`data-testid="dispatch-lane-${s}-none"`);
		}
		expect(text(element(html, "dispatch-lane-queued-none"))).toBe(
			"None waiting to start.",
		);
	});

	it("orders a lane: the next to start first, otherwise latest first", () => {
		const early = dispatch("queued", { createdAt: "2026-10-12T09:00:00.000Z" });
		const late = dispatch("queued", { createdAt: "2026-10-12T11:00:00.000Z" });
		expect(laneOrder([late, early]).map((d) => d.id)).toEqual([
			early.id,
			late.id,
		]);
		const old = dispatch("complete", { closedAt: "2026-10-12T10:00:00.000Z" });
		const recent = dispatch("complete", {
			closedAt: "2026-10-12T12:00:00.000Z",
		});
		expect(laneOrder([old, recent]).map((d) => d.id)).toEqual([
			recent.id,
			old.id,
		]);
	});
});

describe("a dispatch card", () => {
	const running = dispatch("running");
	const card = tip(<DispatchCard dispatch={running} now={NOW} />);

	it("names the agent and title, the slug beneath", () => {
		expect(text(element(card, `dispatch-card-name-${running.id}`))).toBe(
			"Atlas",
		);
		expect(text(element(card, `dispatch-card-title-${running.id}`))).toBe(
			"Domain modeller",
		);
		expect(text(element(card, `dispatch-card-slug-${running.id}`))).toBe(
			"atlas",
		);
		const untitled = dispatch("running", {
			agent: { ...running.agent, title: null },
		});
		expect(tip(<DispatchCard dispatch={untitled} now={NOW} />)).not.toContain(
			`dispatch-card-title-${untitled.id}`,
		);
	});

	it("shows the brief's module and requirement ids, or that it has none", () => {
		expect(text(element(card, `dispatch-card-brief-${running.id}`))).toBe(
			"Module M3 R-12 R-14",
		);
		const none = dispatch("running", { briefRef: null });
		expect(
			text(
				element(
					tip(<DispatchCard dispatch={none} now={NOW} />),
					`dispatch-card-brief-${none.id}`,
				),
			),
		).toBe("No brief");
	});

	it("offers the brief it started with, by hash, only once one is frozen", () => {
		expect(card).not.toContain(`dispatch-card-brief-text-${running.id}`);
		const started = dispatch("running", { briefSha256: SHA });
		const html = tip(<DispatchCard dispatch={started} now={NOW} />);
		const line = element(html, `dispatch-card-brief-text-${started.id}`);
		expect(text(line)).toContain(SHA.slice(0, 7));
		expect(text(line)).toContain("Read brief");
	});

	it("tones the brief's headings, never a heading inside the client's source", () => {
		const md = [
			"# M1: Booking",
			"## Read",
			"```md",
			"# Client title",
			"```",
			"text",
		].join("\n");
		expect(briefLineTones(md)).toEqual([
			"heading",
			"heading",
			"key",
			undefined,
			"key",
			undefined,
		]);
	});

	it("shows the identity ref with its short hash, and the model", () => {
		const ref = element(card, `dispatch-card-ref-${running.id}`);
		expect(text(ref)).toContain("atlas@v3");
		expect(text(ref)).toContain(SHA.slice(0, 7));
		// The full hash is on hover and for screen readers, never shown.
		expect(text(ref)).not.toContain(SHA);
		expect(ref).toContain(`data-full="${SHA}"`);
		expect(text(element(card, `dispatch-card-model-${running.id}`))).toBe(
			"claude-opus-5-5",
		);
	});

	it("says a waiting dispatch's identity and model are set when it starts", () => {
		const queued = dispatch("queued");
		const html = tip(<DispatchCard dispatch={queued} now={NOW} />);
		expect(text(element(html, `dispatch-card-ref-${queued.id}`))).toBe(
			"Identity set when it starts",
		);
		expect(text(element(html, `dispatch-card-model-${queued.id}`))).toBe(
			"Model set when it starts",
		);
		expect(text(element(html, `dispatch-card-times-${queued.id}`))).toBe(
			"Queued 12 Oct, 13:40",
		);
		// Not started: the clock shows the limit, not minutes run.
		expect(text(element(html, `dispatch-budget-clock-${queued.id}`))).toBe(
			"Time limit 45 min",
		);
	});

	it("shows started and closed times in UTC", () => {
		expect(text(element(card, `dispatch-card-times-${running.id}`))).toBe(
			"Started 12 Oct, 13:48",
		);
		const done = dispatch("complete");
		const html = tip(<DispatchCard dispatch={done} now={NOW} />);
		expect(text(element(html, `dispatch-card-times-${done.id}`))).toBe(
			"Started 12 Oct, 13:48 Closed 12 Oct, 13:58",
		);
	});

	it("opens in place for the territory, token split and skills; inert while closed", () => {
		const toggle = tagOf(card, `dispatch-card-toggle-${running.id}`);
		expect(toggle).toContain('aria-expanded="false"');
		expect(toggle).toContain('aria-label="Show details for Atlas"');
		const details = element(card, `dispatch-card-details-${running.id}`);
		expect(tagOf(card, `dispatch-card-details-${running.id}`)).toMatch(
			/\binert=""/,
		);
		expect(toggle).toContain(
			`aria-controls="${/\bid="([^"]+)"/.exec(tagOf(card, `dispatch-card-details-${running.id}`))?.[1]}"`,
		);
		expect(text(details)).toContain("src/billing/**");
		expect(text(element(details, `dispatch-token-split-${running.id}`))).toBe(
			"Input 15,000 Output 5,000 Cache read 3,000 Cache write 1,000",
		);
		expect(text(details)).toContain(SKILLS.slice(0, 7));
	});

	it("shows no generated id as visible text, on any status", () => {
		const html = tip(
			<DispatchBoard dispatches={[...ONE_OF_EACH, ...HALTS]} now={NOW} />,
		);
		const seen = visibleText(html);
		expect(seen).not.toMatch(UUID_FRAGMENT);
		for (const d of [...ONE_OF_EACH, ...HALTS]) {
			expect(seen).not.toContain(d.id);
			expect(seen).not.toContain(d.rosterEntryId);
			expect(seen).not.toContain(d.agent.templateId);
		}
		expect(seen).not.toContain(MISSION);
		expect(seen).not.toContain(SHA);
	});
});

describe("a dispatch's budget", () => {
	it("counts tokens against the estimate and names both ceilings as multiples", () => {
		const d = dispatch("running");
		const html = tip(<DispatchBudget dispatch={d} now={NOW} />);
		expect(text(element(html, `dispatch-budget-tokens-${d.id}`))).toBe(
			"24,000 of 40,000 estimated tokens",
		);
		expect(text(element(html, `dispatch-budget-ceilings-${d.id}`))).toBe(
			"Soft limit 60,000 (1.5×) · Hard limit 120,000 (3×)",
		);
		expect(text(element(html, `dispatch-budget-spend-${d.id}`))).toBe(
			"$0.0421 spent",
		);
		expect(text(element(html, `dispatch-budget-clock-${d.id}`))).toBe(
			"12 min of 45 min",
		);
		// The track runs to the hard ceiling: the marks sit inside it.
		expect(tagOf(html, `dispatch-budget-fill-${d.id}`)).toContain("width:20%");
		expect(tagOf(html, `dispatch-budget-estimate-mark-${d.id}`)).toContain(
			"left:33.33",
		);
		expect(tagOf(html, `dispatch-budget-soft-mark-${d.id}`)).toContain(
			"left:50%",
		);
		const meter = /<meter[^>]*>/.exec(html)?.[0] ?? "";
		expect(meter).toContain('value="24000"');
		expect(meter).toContain('max="120000"');
		expect(meter).toContain('high="60000"');
		expect(html).not.toContain(`dispatch-budget-soft-crossed-${d.id}`);
		expect(html).not.toContain(`dispatch-budget-halt-${d.id}`);
		expect(tagOf(html, `dispatch-budget-${d.id}`)).toContain('data-tone="ok"');
	});

	it("warns once the soft ceiling is crossed", () => {
		const d = dispatch("running", {
			softCeilingCrossed: true,
			tokensUsed: 72_000,
			tokensIn: 60_000,
			tokensOut: 12_000,
			cacheReadTokens: 0,
			cacheWriteTokens: 0,
		});
		const html = tip(<DispatchBudget dispatch={d} now={NOW} />);
		expect(text(element(html, `dispatch-budget-soft-crossed-${d.id}`))).toBe(
			"Passed the soft limit",
		);
		expect(tagOf(html, `dispatch-budget-${d.id}`)).toContain(
			'data-tone="warn"',
		);
		expect(tagOf(html, `dispatch-budget-fill-${d.id}`)).toMatch(
			/data-tone="warn"[^>]*bg-gate-warn/,
		);
	});

	it("names every halt reason in words, and only on a halted dispatch", () => {
		expect(HALTS.map((d) => d.haltReason)).toEqual([...HALT_REASONS]);
		for (const d of HALTS) {
			const reason = d.haltReason as HaltReason;
			const html = tip(<DispatchBudget dispatch={d} now={NOW} />);
			const line = element(html, `dispatch-budget-halt-${d.id}`);
			expect(text(line)).toBe(HALT_REASON_LABEL[reason]);
			expect(tagOf(html, `dispatch-budget-halt-${d.id}`)).toContain(
				`data-reason="${reason}"`,
			);
			expect(tagOf(html, `dispatch-budget-${d.id}`)).toContain(
				'data-tone="halted"',
			);
		}
		for (const d of ONE_OF_EACH.filter((x) => x.status !== "halted")) {
			expect(tip(<DispatchBudget dispatch={d} now={NOW} />)).not.toContain(
				"dispatch-budget-halt-",
			);
		}
	});

	it("says the operator stopped it, after a soft crossing, at the minutes it ran", () => {
		const d = dispatch("halted", {
			haltReason: "operator",
			softCeilingCrossed: true,
			tokensUsed: 70_000,
			tokensIn: 70_000,
			tokensOut: 0,
			cacheReadTokens: 0,
			cacheWriteTokens: 0,
			spendUsd: 1.284,
		});
		const html = tip(<DispatchBudget dispatch={d} now={NOW} />);
		expect(text(element(html, `dispatch-budget-halt-${d.id}`))).toBe(
			"Stopped by the operator",
		);
		expect(html).toContain(`dispatch-budget-soft-crossed-${d.id}`);
		expect(text(element(html, `dispatch-budget-spend-${d.id}`))).toBe(
			"$1.28 spent",
		);
		// Closed at 13:58: the clock stops there, not at now.
		expect(text(element(html, `dispatch-budget-clock-${d.id}`))).toBe(
			"10 min of 45 min",
		);
	});

	it("formats dollars, minutes and multiples", () => {
		expect(formatUsd(0)).toBe("$0.00");
		expect(formatUsd(0.0421)).toBe("$0.0421");
		expect(formatUsd(12.4)).toBe("$12.40");
		expect(minutesRun({ startedAt: null, closedAt: null }, NOW)).toBeNull();
		expect(
			minutesRun(
				{ startedAt: "2026-10-12T13:48:00.000Z", closedAt: null },
				NOW,
			),
		).toBe(12);
		expect(multipleOf(60_000, 40_000)).toBe("1.5×");
		expect(multipleOf(120_000, 40_000)).toBe("3×");
		expect(multipleOf(1, 0)).toBeNull();
	});
});

describe("the mission's spend bar", () => {
	const bar = (spentUsd: number, spendCeilingUsd: number | null) =>
		tip(
			<MissionSpendBar spentUsd={spentUsd} spendCeilingUsd={spendCeilingUsd} />,
		);

	it("shows spent against the ceiling, warning from 80% and blocking at it", () => {
		const half = bar(25, 50);
		expect(text(half)).toBe("$25.00 of $50.00 spent");
		expect(tagOf(half, "mission-spend-bar")).toContain('data-tone="ok"');
		expect(tagOf(half, "mission-spend-fill")).toContain("width:50%");
		expect(tagOf(bar(39.99, 50), "mission-spend-bar")).toContain(
			'data-tone="ok"',
		);
		expect(tagOf(bar(40, 50), "mission-spend-bar")).toContain(
			'data-tone="warn"',
		);
		expect(tagOf(bar(35.6, 40), "mission-spend-bar")).toContain(
			'data-tone="warn"',
		);
		const over = bar(52, 50);
		expect(tagOf(over, "mission-spend-bar")).toContain('data-tone="halted"');
		expect(tagOf(over, "mission-spend-fill")).toContain("width:100%");
	});

	it("says when no ceiling is set, with no bar", () => {
		const html = bar(3.5, null);
		expect(text(html)).toBe("$3.50 spent · No ceiling set");
		expect(html).not.toContain("mission-spend-fill");
		expect(html).not.toContain("<meter");
	});
});
