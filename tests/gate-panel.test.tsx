import { QueryClient } from "@tanstack/react-query";
import {
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import {
	type Finding,
	finding,
	type GateReasonWire,
	type GateRun,
	gateReason,
	gateRun,
	gateRunSummary,
} from "avel-server/contract";
import type { ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { InlineModals } from "@/components/avel/action-modal";
import {
	DismissFinding,
	FindingsPanel,
} from "@/components/avel/findings-panel";
import {
	GatePanel,
	GateReceipt,
	GateRefusal,
} from "@/components/avel/gate-panel";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ApiOverrideProvider, ApiProvider } from "@/lib/api";
import { queryKeys } from "@/lib/api/keys";
import { contractError } from "./clients-fixtures";
import { tagOf } from "./render-page";

// ---------------------------------------------------------------------------
// Fixtures, parsed through the contract's own schemas.

const MISSION = "00000000-0000-4000-8000-000000000001";
const RUN = "00000000-0000-4000-8000-000000000101";
const DISPATCH = "00000000-0000-4000-8000-000000000201";
const COMMIT = "c".repeat(40);
const BASE = "b".repeat(40);
const RECEIPT = "d".repeat(64);

const reason = (extra: Partial<GateReasonWire>): GateReasonWire =>
	gateReason.parse({
		gate: "qa",
		findingId: "check:CK1:1",
		kind: "check",
		source: "qa-check",
		subject: "src/app.ts",
		policy: "mandatory",
		rule: "mandatory_failed",
		effect: "block",
		degraded: false,
		overridable: true,
		severity: { model: "high", operator: null },
		overrides: [],
		message: "The unit suite fails on the booking path.",
		...extra,
	});

const OVERRIDABLE = reason({});
const FIXED = reason({
	findingId: "checkpoint:protected:infra/main.tf",
	rule: "checkpoint_violation",
	overridable: false,
	message: "A dispatch wrote a protected path.",
});
const DEGRADED = reason({
	gate: "security",
	findingId: "not_run:security",
	kind: "synthesized",
	policy: "warn",
	rule: "degraded_not_run",
	effect: "warn",
	degraded: true,
	overridable: false,
	severity: null,
	source: null,
	message: "The security scan isn't installed.",
});

const RUN_BLOCK: GateRun = gateRun.parse({
	id: RUN,
	at: "2026-10-19T10:00:00.000Z",
	missionId: MISSION,
	commitSha: COMMIT,
	baseSha: BASE,
	result: "fail",
	decideVersion: 1,
	receiptVersion: 1,
	configSha256: "e".repeat(64),
	receiptSha256: RECEIPT,
	gates: [
		{
			gate: "qa",
			policy: "mandatory",
			result: "fail",
			reasons: [OVERRIDABLE, FIXED],
		},
		{ gate: "security", policy: "warn", result: "pass", reasons: [DEGRADED] },
	],
	reasons: [OVERRIDABLE, FIXED, DEGRADED],
	ignoredOverrides: [
		{
			findingId: "check:CK9:1",
			commitSha: BASE,
			rationale: "Old note",
			why: "wrong_commit",
		},
	],
	excludedDispatches: [
		{
			dispatchId: DISPATCH,
			status: "halted",
			closedAt: "2026-10-18T09:30:00.000Z",
		},
	],
	receipt: "{}",
});

const SUMMARY = gateRunSummary.parse({
	...RUN_BLOCK,
	actor: {
		kind: "operator",
		userId: "00000000-0000-4000-8000-000000000301",
		rosterEntryId: null,
		canonSessionId: null,
		display: "javaris500",
		agent: null,
	},
});

const finding_ = (n: number, extra: Partial<Finding>): Finding =>
	finding.parse({
		id: `00000000-0000-4000-8000-${String(400 + n).padStart(12, "0")}`,
		missionId: MISSION,
		clientId: null,
		rule: "spec-check:R1",
		subject: `Finding ${n}`,
		severity: "high",
		class: "correctness",
		status: "open",
		dismissedReason: null,
		caughtBy: "spec-judge",
		reportedByDispatchId: null,
		createdAt: "2026-10-19T09:00:00.000Z",
		updatedAt: "2026-10-19T09:00:00.000Z",
		...extra,
	});

// ---------------------------------------------------------------------------
// Rendering: inside a router (links), with the query cache seeded.

async function render(
	node: ReactNode,
	seed: (qc: QueryClient) => void = () => {},
) {
	const qc = new QueryClient({
		defaultOptions: {
			queries: { staleTime: Number.POSITIVE_INFINITY, retry: false },
		},
	});
	seed(qc);
	const root = createRootRoute({
		component: () => (
			<ApiOverrideProvider queryClient={qc}>
				<ApiProvider>
					<TooltipProvider>
						<InlineModals>{node}</InlineModals>
					</TooltipProvider>
				</ApiProvider>
			</ApiOverrideProvider>
		),
	});
	const router = createRouter({
		routeTree: root.addChildren([
			createRoute({ getParentRoute: () => root, path: "/missions/$id" }),
		]),
		history: createMemoryHistory({ initialEntries: ["/"] }),
	});
	await router.load();
	return renderToString(<RouterProvider router={router} />);
}

const withRuns =
	(runs: (typeof SUMMARY)[], total = runs.length) =>
	(qc: QueryClient) => {
		qc.setQueryData([...queryKeys.gate.runs(MISSION)], {
			pages: [{ data: runs, meta: { nextCursor: null, total } }],
			pageParams: [undefined],
		});
		qc.setQueryData([...queryKeys.gate.run(MISSION, RUN)], RUN_BLOCK);
	};

const withFindings =
	(
		status: string,
		rows: Finding[],
		counts = { open: 2, confirmed: 1, dismissed: 3 },
	) =>
	(qc: QueryClient) => {
		qc.setQueryData([...queryKeys.findings.list(MISSION, status)], {
			pages: [{ data: rows, meta: { nextCursor: null, counts } }],
			pageParams: [undefined],
		});
	};

/** The markup from an element with this test id onwards. */
function element(html: string, testid: string): string {
	const at = html.indexOf(`data-testid="${testid}"`);
	expect(at, testid).toBeGreaterThan(-1);
	return html.slice(html.lastIndexOf("<", at));
}

// ---------------------------------------------------------------------------

describe("the gate panel", () => {
	it("heads the panel with the latest result, in its tone, never the accent", async () => {
		const html = await render(
			<GatePanel missionId={MISSION} />,
			withRuns([SUMMARY], 4),
		);
		const pill = tagOf(html, "gate-result");
		expect(pill).toContain('data-tone="block"');
		expect(pill).not.toMatch(/accent/);
		expect(element(html, "gate-result")).toContain(">Fail<");
		expect(element(html, "gate-run-count")).toContain(">4 runs<");
	});

	it("names the judged commit and its base, short with copy, and the receipt's hash", async () => {
		const html = await render(
			<GatePanel missionId={MISSION} />,
			withRuns([SUMMARY]),
		);
		expect(element(html, "gate-commit")).toContain(`data-full="${COMMIT}"`);
		expect(element(html, "gate-base")).toContain(`data-full="${BASE}"`);
		expect(element(html, "gate-receipt-sha")).toContain(
			`data-full="${RECEIPT}"`,
		);
	});

	it("offers Run gate as the one primary, held for a preview", async () => {
		const html = await render(
			<GatePanel missionId={MISSION} />,
			withRuns([SUMMARY]),
		);
		const run = tagOf(html, "gate-run");
		expect(run).toContain('data-variant="default"');
		expect(html.match(/data-variant="default"/g)).toHaveLength(1);
	});

	it("says the gate hasn't judged yet, and still offers Run gate", async () => {
		const html = await render(<GatePanel missionId={MISSION} />, withRuns([]));
		expect(html).toContain("The gate hasn&#x27;t judged this mission yet.");
		expect(html).toContain('data-testid="gate-run"');
		expect(element(html, "gate-run-count")).toContain(">0 runs<");
	});
});

describe("a gate run's receipt", () => {
	const receipt = (drafts: Record<string, string> = {}) =>
		render(<GateReceipt run={RUN_BLOCK} drafts={drafts} onDraft={() => {}} />);

	it("lists each gate with its policy's shape and its result, a fail opened", async () => {
		const html = await receipt();
		expect(html.indexOf('data-testid="gate-row-qa"')).toBeLessThan(
			html.indexOf('data-testid="gate-row-security"'),
		);
		expect(element(html, "gate-row-qa")).toMatch(
			/data-glyph="stop"[^>]*fill-text-muted/,
		);
		expect(element(html, "gate-row-security")).toMatch(/data-glyph="pass"/);
		expect(tagOf(html, "gate-row-qa-toggle")).toContain('aria-expanded="true"');
		expect(tagOf(html, "gate-row-security-toggle")).toContain(
			'aria-expanded="false"',
		);
		expect(tagOf(html, "gate-row-qa-result")).toContain('data-tone="block"');
		expect(tagOf(html, "gate-row-security-result")).toContain(
			'data-tone="warn"',
		);
	});

	it("explains each reason: message, rule in words, effect, severity and source", async () => {
		const qa = element(await receipt(), `gate-reason-${OVERRIDABLE.findingId}`);
		expect(qa).toContain(OVERRIDABLE.message);
		expect(qa).toContain(">A mandatory gate failed<");
		expect(qa).toContain(">Blocks<");
		expect(qa).toContain("Model: High");
		expect(qa).toContain(">qa-check<");
	});

	it("offers an override only where one would clear the block, and says why not otherwise", async () => {
		const html = await receipt();
		expect(html).toContain(
			`data-testid="gate-override-${OVERRIDABLE.findingId}-open"`,
		);
		expect(html).not.toContain(
			`data-testid="gate-override-${FIXED.findingId}-open"`,
		);
		expect(
			element(html, `gate-reason-${FIXED.findingId}-no-override`),
		).toContain("An override doesn&#x27;t clear this rule.");
	});

	it("keeps a written rationale in its field, bound to the run's commit", async () => {
		const html = await receipt({ [OVERRIDABLE.findingId]: "Flaky on CI only" });
		expect(element(html, `gate-override-${OVERRIDABLE.findingId}`)).toContain(
			"Flaky on CI only",
		);
		expect(element(html, `gate-reason-${OVERRIDABLE.findingId}`)).toContain(
			`data-full="${COMMIT}"`,
		);
	});

	it("reads a degraded reason as not checked yet, in the stale tone, never a pass", async () => {
		// The security gate is folded; open its reason by rendering it alone.
		const html = await render(
			<GateReceipt
				run={{
					...RUN_BLOCK,
					gates: [
						{
							...RUN_BLOCK.gates[1],
							result: "fail",
						} as GateRun["gates"][number],
					],
				}}
				drafts={{}}
				onDraft={() => {}}
			/>,
		);
		const row = element(html, `gate-reason-${DEGRADED.findingId}`);
		expect(
			element(row, `gate-reason-${DEGRADED.findingId}-degraded`),
		).toContain("Not checked yet");
		expect(row).toContain('data-tone="stale"');
		expect(row).not.toContain(">Passes<");
	});

	it("lists overrides it didn't apply with why, and dispatches it didn't judge", async () => {
		const html = await receipt();
		expect(element(html, "gate-ignored-check:CK9:1")).toContain(
			"Written for another commit",
		);
		const excluded = element(html, `gate-excluded-${DISPATCH}`);
		expect(excluded).toContain(">Halted<");
		expect(excluded).toContain('dateTime="2026-10-18T09:30:00.000Z"');
	});
});

describe("a refused gate run", () => {
	it("says why in the error map's words and links each running dispatch to its row", async () => {
		const html = await render(
			<GateRefusal
				missionId={MISSION}
				error={contractError(422, "PRECONDITION_FAILED", {
					reason: "dispatches_running",
					missionId: MISSION,
					issues: [{ path: ["dispatches", DISPATCH], message: "running" }],
				})}
			/>,
		);
		expect(html).toContain("A dispatch is still queued or running");
		expect(tagOf(html, `gate-refusal-dispatch-${DISPATCH}`)).toContain(
			`href="/missions/${MISSION}#dispatch-${DISPATCH}"`,
		);
	});

	it("lists a conflict's paths in mono", async () => {
		const html = await render(
			<GateRefusal
				missionId={MISSION}
				error={contractError(422, "PRECONDITION_FAILED", {
					reason: "integration_conflict",
					missionId: MISSION,
					issues: [
						{ path: ["integration", "src/app.ts"], message: `${DISPATCH}, x` },
					],
				})}
			/>,
		);
		expect(html).toContain("Two finished dispatches changed the same file");
		expect(element(html, "gate-refusal-path-integration/src/app.ts")).toMatch(
			/^<code[^>]*type-mono[^>]*>src\/app\.ts</,
		);
	});
});

describe("the findings panel", () => {
	const OPEN = finding_(1, { severity: "critical" });
	const MEDIUM = finding_(2, { severity: "medium", subject: "Medium one" });

	it("splits by status, each with its count over the mission, Open first", async () => {
		const html = await render(
			<FindingsPanel missionId={MISSION} />,
			withFindings("open", [OPEN, MEDIUM]),
		);
		expect(tagOf(html, "findings-status-open")).toContain(
			'aria-pressed="true"',
		);
		for (const [s, n] of [
			["open", 2],
			["confirmed", 1],
			["dismissed", 3],
		] as const)
			expect(element(html, `findings-status-${s}`)).toContain(`>${n}<`);
	});

	it("pills severity: critical and high block, medium warns, low is pending", async () => {
		const LOW = finding_(3, { severity: "low" });
		const html = await render(
			<FindingsPanel missionId={MISSION} />,
			withFindings("open", [OPEN, MEDIUM, LOW]),
		);
		expect(tagOf(html, `finding-${OPEN.id}-severity`)).toContain(
			'data-tone="block"',
		);
		expect(tagOf(html, `finding-${MEDIUM.id}-severity`)).toContain(
			'data-tone="warn"',
		);
		expect(tagOf(html, `finding-${LOW.id}-severity`)).toContain(
			'data-tone="pending"',
		);
	});

	it("triages an open finding: Confirm secondary, Dismiss outlined", async () => {
		const html = await render(
			<FindingsPanel missionId={MISSION} />,
			withFindings("open", [OPEN]),
		);
		expect(tagOf(html, `finding-${OPEN.id}-confirm`)).toContain(
			'data-variant="secondary"',
		);
		expect(tagOf(html, `finding-${OPEN.id}-dismiss`)).toContain(
			'data-variant="outline"',
		);
	});

	it("shows a dismissed finding's reason, with nothing left to triage", async () => {
		const gone = finding_(4, {
			status: "dismissed",
			dismissedReason: "Test fixture",
		});
		const html = await render(
			<FindingsPanel missionId={MISSION} initialStatus="dismissed" />,
			withFindings("dismissed", [gone]),
		);
		expect(element(html, `finding-${gone.id}-dismissed-reason`)).toContain(
			"Dismissed: Test fixture",
		);
		expect(html).not.toContain(`finding-${gone.id}-confirm`);
	});

	it("says so, compactly, when a status has none", async () => {
		const html = await render(
			<FindingsPanel missionId={MISSION} initialStatus="confirmed" />,
			withFindings("confirmed", []),
		);
		expect(element(html, "findings-empty")).toContain("No confirmed findings");
	});

	it("asks why before dismissing, and holds until there's a reason", async () => {
		const html = await render(
			<DismissFinding finding={OPEN} missionId={MISSION} onClose={() => {}} />,
		);
		expect(html).toContain('data-testid="finding-dismiss-reason"');
		expect(tagOf(html, "finding-dismiss-submit")).toMatch(/aria-describedby=/);
		expect(html).toContain("Say why it isn&#x27;t a defect.");
	});
});

describe("a finding that blocks the gate", () => {
	const JUDGED = finding_(5, { subject: "Booking skips auth" });
	const PASSED = finding_(6, { subject: "Copy typo" });
	const judge = (id: string, effect: "block" | "pass" | "overridden") =>
		reason({
			gate: "security",
			findingId: id,
			kind: "judge",
			rule: effect === "block" ? "judge_open" : "passed",
			effect,
			overridable: false,
		});

	const seed = (reasons: GateReasonWire[]) => (qc: QueryClient) => {
		withRuns([SUMMARY])(qc);
		qc.setQueryData([...queryKeys.gate.run(MISSION, RUN)], {
			...RUN_BLOCK,
			reasons,
		});
		withFindings("open", [JUDGED, PASSED])(qc);
	};

	it("says so on the finding, linking to the gate, from the latest run's blocking reasons", async () => {
		const html = await render(
			<FindingsPanel missionId={MISSION} />,
			seed([judge(JUDGED.id, "block"), judge(PASSED.id, "pass")]),
		);
		const link = tagOf(html, `finding-${JUDGED.id}-blocking`);
		expect(link).toContain('href="#gate"');
		expect(element(html, `finding-${JUDGED.id}-blocking`)).toContain(
			"Blocking the gate",
		);
		expect(html).not.toContain(`finding-${PASSED.id}-blocking`);
	});

	it("says nothing once an override clears it, or before any run", async () => {
		const cleared = await render(
			<FindingsPanel missionId={MISSION} />,
			seed([judge(JUDGED.id, "overridden")]),
		);
		expect(cleared).not.toContain(`finding-${JUDGED.id}-blocking`);
		const none = await render(<FindingsPanel missionId={MISSION} />, (qc) => {
			withRuns([])(qc);
			withFindings("open", [JUDGED])(qc);
		});
		expect(none).not.toContain(`finding-${JUDGED.id}-blocking`);
	});

	it("is anchored: the gate panel is #gate", async () => {
		const html = await render(
			<GatePanel missionId={MISSION} />,
			withRuns([SUMMARY]),
		);
		expect(html).toContain('<div id="gate">');
	});
});
