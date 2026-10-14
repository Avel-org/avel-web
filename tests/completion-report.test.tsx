import type { CompletionReport, HaltReason } from "avel-server/contract";
import { describe, expect, it } from "vitest";
import {
	CompletionReportView,
	type DispatchAgent,
	tokensAgainstEstimate,
	workaroundText,
} from "@/components/avel/completion-report";
import { inProviders, seededClient } from "./catalog-fixtures";
import { UUID_FRAGMENT, visibleText } from "./visible-text";

const hash = (c: string) => c.repeat(64);

const LEON: DispatchAgent = {
	templateId: "11111111-1111-4111-8111-111111111111",
	slug: "leon",
	name: "Leon",
	title: "Frontend engineer",
};
const ATLAS: DispatchAgent = {
	templateId: "22222222-2222-4222-8222-222222222222",
	slug: "atlas",
	name: "Atlas",
	title: "Full-stack lead",
};
const PRODUCER_ID = "33333333-3333-4333-8333-333333333333";

function report(over: Partial<CompletionReport> = {}): CompletionReport {
	return {
		id: "44444444-4444-4444-8444-444444444444",
		dispatchId: "55555555-5555-4555-8555-555555555555",
		missionId: "66666666-6666-4666-8666-666666666666",
		rosterEntryId: "77777777-7777-4777-8777-777777777777",
		status: "complete",
		haltReason: null,
		softCeilingCrossed: false,
		actualTokens: 12_400,
		agentVersionSha256: hash("a"),
		agentVersionRef: "leon@v2",
		skillsSha256: hash("b"),
		versionSource: "recorded",
		model: "claude-opus-5-5",
		artifactsRead: [{ path: "src/contract/booking.ts", sha256: hash("c") }],
		artifactsWritten: [
			{ path: "src/routes/booking.tsx", sha256: hash("d") },
			{ path: "src/components/slot-picker.tsx", sha256: hash("e") },
		],
		filesTouched: 2,
		fileTypesTouched: ["tsx"],
		rereads: 1,
		blockers: [],
		edgeMismatches: [],
		filedBy: "agent",
		createdAt: "2026-10-13T12:00:00.000Z",
		...over,
	};
}

const DISPATCH = { agent: LEON, estimatedTokens: 15_000 };

function render(
	r: CompletionReport,
	props: Partial<Parameters<typeof CompletionReportView>[0]> = {},
) {
	return inProviders(
		<CompletionReportView report={r} dispatch={DISPATCH} {...props} />,
		seededClient(),
	);
}

/** The visible text of the element with this testid, to the end of the markup. */
const region = (html: string, testId: string) => {
	const at = html.indexOf(`data-testid="${testId}"`);
	expect(at, testId).toBeGreaterThan(-1);
	return visibleText(html.slice(at));
};

describe("tokensAgainstEstimate", () => {
	it("says the estimate and how far over", () => {
		expect(tokensAgainstEstimate(12_400, 15_000)).toEqual({
			line: "12,400 of 15,000 estimated tokens",
			over: null,
		});
		expect(tokensAgainstEstimate(18_000, 15_000).over).toBe(
			"3,000 over the estimate",
		);
	});

	it("counts alone without an estimate", () => {
		expect(tokensAgainstEstimate(1, undefined)).toEqual({
			line: "1 token",
			over: null,
		});
	});
});

describe("workaroundText", () => {
	it("says when there was none", () => {
		const b = { description: "x", provisioningGap: false };
		expect(workaroundText({ ...b, workaround: "  " })).toBe("No workaround.");
		expect(workaroundText({ ...b, workaround: "Mocked it" })).toBe(
			"Workaround: Mocked it",
		);
	});
});

describe("CompletionReportView", () => {
	it("a complete report: status, filer, tokens, version, artifacts, footprint", () => {
		const html = render(report());
		const text = visibleText(html);
		expect(html).toContain('data-status="complete"');
		expect(region(html, "report-status")).toMatch(/^ ?Complete/);
		expect(region(html, "report-filed-by")).toMatch(/^ ?Filed by the agent/);
		expect(region(html, "report-tokens-line")).toMatch(
			/^ ?12,400 of 15,000 estimated tokens/,
		);
		expect(html).not.toContain('data-testid="report-tokens-over"');
		expect(html).not.toContain('data-testid="report-halt-reason"');
		expect(html).not.toContain('data-testid="report-blockers"');
		expect(html).not.toContain('data-testid="report-mismatches"');
		// The agent, linked to its page, its version ref and seven-character hash.
		expect(html).toMatch(
			/href="\/catalog\/agents\/leon"[^>]*data-testid="report-agent-link"|data-testid="report-agent-link"[^>]*href="\/catalog\/agents\/leon"/,
		);
		expect(text).toContain("Leon leon@v2 aaaaaaa");
		expect(html).not.toContain('data-testid="report-version-source"');
		// Read and written, grouped, each a path and its short hash.
		expect(region(html, "report-read-0")).toMatch(
			/^ ?src\/contract\/booking\.ts ccccccc/,
		);
		expect(text).toContain("Written (2)");
		expect(region(html, "report-written-1")).toMatch(
			/^ ?src\/components\/slot-picker\.tsx eeeeeee/,
		);
		expect(region(html, "report-files-touched")).toMatch(
			/^ ?2 files touched · 1 reread/,
		);
		expect(region(html, "report-file-types")).toMatch(/^ ?tsx/);
		expect(text).not.toMatch(UUID_FRAGMENT);
	});

	it("over the estimate and past the soft limit says both", () => {
		const html = render(
			report({ actualTokens: 18_000, softCeilingCrossed: true }),
		);
		expect(region(html, "report-tokens-over")).toMatch(
			/^ ?3,000 over the estimate/,
		);
		expect(html).toContain('data-testid="report-soft-ceiling"');
	});

	it("a blocked report lists blockers with workarounds and flags a provisioning gap", () => {
		const html = render(
			report({
				status: "blocked",
				artifactsWritten: [],
				blockers: [
					{
						description: "The staging database URL was not set.",
						workaround: "",
						provisioningGap: true,
					},
					{
						description: "The slot API returns no time zone.",
						workaround: "Assumed UTC and noted it in the brief.",
						provisioningGap: false,
					},
				],
			}),
		);
		expect(region(html, "report-status")).toMatch(/^ ?Blocked/);
		expect(region(html, "report-blockers")).toMatch(/^ ?Blockers \(2\)/);
		expect(html).toMatch(
			/data-testid="report-blocker-0" data-provisioning-gap="true"/,
		);
		expect(region(html, "report-blocker-0-gap")).toMatch(/^ ?Provisioning gap/);
		expect(region(html, "report-blocker-0-workaround")).toMatch(
			/^ ?No workaround\./,
		);
		expect(html).not.toContain('data-testid="report-blocker-1-gap"');
		expect(region(html, "report-blocker-1-workaround")).toMatch(
			/^ ?Workaround: Assumed UTC/,
		);
		expect(html).toContain('data-testid="report-written-none"');
		expect(visibleText(html)).not.toMatch(UUID_FRAGMENT);
	});

	it("a failed report is filed by the runner", () => {
		const html = render(
			report({ status: "failed", filedBy: "system", artifactsWritten: [] }),
		);
		expect(region(html, "report-status")).toMatch(/^ ?Failed/);
		expect(html).toContain('data-tone="block"');
		expect(region(html, "report-filed-by")).toMatch(/^ ?Filed by the runner/);
		expect(html).not.toContain('data-testid="report-halt-reason"');
	});

	it.each<[HaltReason, string]>([
		["token_hard_ceiling", "Token limit reached"],
		["spend_ceiling", "Spend limit reached"],
		["wall_clock", "Time limit reached"],
		["operator", "Stopped by the operator"],
	])("a report halted for %s says why", (haltReason, label) => {
		const html = render(
			report({ status: "halted", haltReason, filedBy: "system" }),
		);
		expect(region(html, "report-status")).toMatch(/^ ?Halted/);
		expect(region(html, "report-halt-reason")).toMatch(
			new RegExp(`^ ?${label}`),
		);
		expect(region(html, "report-filed-by")).toMatch(/^ ?Filed by the runner/);
	});

	it("an edge mismatch names the producer's agent and both hashes", () => {
		const html = render(
			report({
				edgeMismatches: [
					{
						path: "src/contract/booking.ts",
						readSha256: hash("c"),
						writtenSha256: hash("f"),
						producerDispatchId: PRODUCER_ID,
					},
				],
			}),
			{ producers: { [PRODUCER_ID]: ATLAS } },
		);
		expect(region(html, "report-mismatches")).toMatch(
			/^ ?Read a different version than was written \(1\)/,
		);
		expect(region(html, "report-mismatch-0")).toMatch(
			/^ ?Read src\/contract\/booking\.ts at ccccccc .*, but Atlas wrote fffffff/,
		);
		expect(html).toMatch(
			/href="\/catalog\/agents\/atlas"[^>]*data-testid="report-mismatch-0-producer"|data-testid="report-mismatch-0-producer"[^>]*href="\/catalog\/agents\/atlas"/,
		);
		expect(visibleText(html)).not.toMatch(UUID_FRAGMENT);
	});

	it("an unnamed producer stays words, its dispatch id only on hover", () => {
		const html = render(
			report({
				edgeMismatches: [
					{
						path: "a.ts",
						readSha256: hash("c"),
						writtenSha256: hash("f"),
						producerDispatchId: PRODUCER_ID,
					},
				],
			}),
		);
		expect(region(html, "report-mismatch-0")).toMatch(
			/, but the agent that wrote it .*wrote fffffff/,
		);
		expect(html).toContain(`title="${PRODUCER_ID}"`);
		expect(visibleText(html)).not.toMatch(UUID_FRAGMENT);
	});

	it("a rebuilt version says so, and the agent falls back to the ref's slug", () => {
		const html = render(report({ versionSource: "reconstructed" }), {
			dispatch: undefined,
		});
		expect(region(html, "report-version-source")).toMatch(
			/^ ?Rebuilt from history/,
		);
		expect(html).toMatch(/href="\/catalog\/agents\/leon"/);
		expect(region(html, "report-tokens-line")).toMatch(/^ ?12,400 tokens/);
	});
});
