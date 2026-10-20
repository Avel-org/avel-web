import { readFileSync } from "node:fs";
import type { Intake } from "avel-server/contract";
import type { ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { InlineModals } from "@/components/avel/action-modal";
import {
	ApproveIntakeModal,
	CANON_QUESTIONS_ID,
	ReadRepoModal,
	ReviseIntakeModal,
} from "@/components/avel/intake-modals";
import { currentRefusal } from "@/components/avel/intake-page";
import { TooltipProvider } from "@/components/ui/tooltip";
import { type ApiClient, ApiProvider } from "@/lib/api";

/*
 * Review 3's intake fixes: a modal opens on the intake as it is now, a
 * refused Propose speaks only for the version it refused, and Canon's open
 * questions lead to the panel that answers them.
 */

const intake = (over: Partial<Intake> = {}): Intake => ({
	id: "00000000-0000-4000-8000-000000007001",
	engagementId: "00000000-0000-4000-8000-000000001001",
	status: "draft",
	sourceMd: "# Booking holds",
	proposedBrief: {
		summary: "Hold a slot while payment completes",
		requirements: [{ id: "R1", text: "A slot can be held" }],
		acceptanceCriteria: [
			{ id: "AC1", requirementId: "R1", text: "Holding marks it taken" },
		],
		modules: [],
		checks: [],
	},
	openQuestions: [],
	derivedCut: null,
	derivedCutEvidence: null,
	derivedConventions: null,
	derivedBoundaries: null,
	repoUrl: "https://github.com/acme/booking",
	repoCommitSha: null,
	repoReadAt: null,
	suggestedPresetId: null,
	recommendedRoster: null,
	draftedByCanonSessionId: null,
	openCanonSessionId: null,
	approvedBy: null,
	approvedAt: null,
	missionId: null,
	createdAt: "2026-10-01T09:00:00.000Z",
	updatedAt: "2026-10-01T09:00:00.000Z",
	...over,
});

const inline = (node: ReactNode) =>
	renderToString(
		<ApiProvider client={{} as ApiClient}>
			<TooltipProvider>
				<InlineModals>{node}</InlineModals>
			</TooltipProvider>
		</ApiProvider>,
	);

describe("an intake modal opens on the intake as it is now (review 3, 1)", () => {
	it("seeds Revise from the intake it is given", () => {
		const newer = intake({
			proposedBrief: {
				...(intake().proposedBrief as NonNullable<Intake["proposedBrief"]>),
				summary: "Canon's newer summary",
			},
		});
		const html = inline(
			<ReviseIntakeModal intake={newer} open onOpenChange={() => {}} />,
		);
		expect(html).toContain("Canon&#x27;s newer summary");
	});

	it("seeds Read repository and Approve with the intake's repository now", () => {
		const moved = intake({ repoUrl: "https://github.com/acme/booking-v2" });
		for (const Modal of [ReadRepoModal, ApproveIntakeModal]) {
			const html = inline(
				<Modal intake={moved} open onOpenChange={() => {}} />,
			);
			expect(html).toContain('value="https://github.com/acme/booking-v2"');
		}
	});

	it("keys each modal's form on its opening, so a modal kept mounted reseeds", () => {
		// The modals stay mounted while closed; a form seeded once at mount
		// would save an older intake over a newer one. Each modal keys its
		// form on useOpenGeneration(open), which counts openings.
		const source = readFileSync(
			"src/components/avel/intake-modals.tsx",
			"utf8",
		);
		for (const name of [
			"ReviseIntake",
			"ReadRepo",
			"ApproveIntake",
			"RejectIntake",
		]) {
			const modal = source.match(
				new RegExp(
					`export function ${name}Modal\\([^)]*\\) \\{([\\s\\S]*?)\\n\\}`,
				),
			)?.[1];
			expect(modal, name).toBeDefined();
			expect(modal, name).toContain("useOpenGeneration(props.open)");
			expect(modal, name).toContain(`<${name}Form key={generation}`);
		}
	});
});

describe("a refused Propose speaks for the version it refused (review 3, 2)", () => {
	const refused = new Error("refused");
	it("shows while the intake is the version that was refused", () => {
		expect(currentRefusal(refused, "v1", "v1")).toBe(refused);
	});
	it("goes once a revise makes a new version, so the local check speaks", () => {
		expect(currentRefusal(refused, "v1", "v2")).toBeNull();
		expect(currentRefusal(null, "v1", "v1")).toBeNull();
		expect(currentRefusal(refused, null, "v1")).toBeNull();
	});
});

describe("Canon's open questions lead to the panel that answers them (review 3, 4)", () => {
	it("no longer says the questions screen isn't built", () => {
		const source = readFileSync(
			"src/components/avel/intake-modals.tsx",
			"utf8",
		);
		expect(source).not.toMatch(/isn't built yet/);
		expect(source).toContain('data-testid="intake-approve-canon-go"');
	});

	it("gives the intake page's questions panel the id the way there scrolls to", () => {
		const page = readFileSync("src/components/avel/intake-page.tsx", "utf8");
		expect(CANON_QUESTIONS_ID).toBe("canon-questions");
		expect(page).toMatch(
			/<div id=\{CANON_QUESTIONS_ID\}[^>]*>\s*<CanonQuestionsPanel/,
		);
	});
});
