import { QueryClient } from "@tanstack/react-query";
import {
	createMemoryHistory,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import type { Intake, IntakeFile } from "avel-server/contract";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ApiOverrideProvider } from "../src/lib/api";
import { ENGAGEMENTS_PAGE_SIZE } from "../src/lib/api/clients";
import { INTAKE_STATUSES, INTAKES_PAGE_SIZE } from "../src/lib/api/intakes";
import { queryKeys } from "../src/lib/api/keys";
import { SessionSourceProvider } from "../src/lib/auth";
import { Route } from "../src/routes/clients_.$id_.intakes.$intakeId";
import { routeTree } from "../src/routeTree.gen";
import { signedIn } from "./auth-session";
import { client, engagement } from "./clients-fixtures";
import { tagOf } from "./render-page";

/*
 * The intake flow's screens (audit F7): the Intakes tab on a client, and one
 * intake's page, rendered through the real router with the cache seeded.
 */

const ONE = client(1);
const ENG = engagement(1, ONE.id);

const intake = (n: number, over: Partial<Intake> = {}): Intake => ({
	id: `00000000-0000-4000-8000-${String(7000 + n).padStart(12, "0")}`,
	engagementId: ENG.id,
	status: "draft",
	sourceMd: `# Intake ${n}\nWhat the client asked for.`,
	proposedBrief: null,
	openQuestions: [],
	derivedCut: null,
	derivedCutEvidence: null,
	derivedConventions: null,
	derivedBoundaries: null,
	repoUrl: null,
	repoCommitSha: null,
	repoReadAt: null,
	suggestedPresetId: null,
	recommendedRoster: null,
	draftedByCanonSessionId: null,
	openCanonSessionId: null,
	approvedBy: null,
	approvedAt: null,
	missionId: null,
	createdAt: `2026-10-0${n}T09:00:00.000Z`,
	updatedAt: `2026-10-0${n}T09:00:00.000Z`,
	...over,
});

const BRIEF = {
	summary: "Hold a slot while payment completes",
	requirements: [{ id: "R1", text: "A slot can be held" }],
	acceptanceCriteria: [
		{ id: "AC1", requirementId: "R1", text: "Holding marks it taken" },
	],
	modules: [],
	checks: [],
};

async function render(
	path: string,
	intakes: Intake[],
	files: Record<string, IntakeFile[]> = {},
): Promise<string> {
	const queryClient = new QueryClient({
		defaultOptions: {
			queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
		},
	});
	const page = <T,>(rows: T[]) => ({
		data: rows,
		meta: { nextCursor: null, total: rows.length },
	});
	queryClient.setQueryData(queryKeys.clients.detail(ONE.id), ONE);
	queryClient.setQueryData(
		queryKeys.engagements.byClient(ONE.id, ENGAGEMENTS_PAGE_SIZE),
		{ pages: [page([ENG])], pageParams: [undefined] },
	);
	queryClient.setQueryData(queryKeys.engagements.detail(ENG.id), ENG);
	queryClient.setQueryData(
		queryKeys.intakes.byEngagement(ENG.id, INTAKES_PAGE_SIZE),
		page(intakes),
	);
	for (const status of INTAKE_STATUSES) {
		const rows = intakes.filter((i) => i.status === status);
		queryClient.setQueryData(
			queryKeys.intakes.byEngagement(ENG.id, 1, status),
			page(rows),
		);
	}
	for (const i of intakes) {
		queryClient.setQueryData(queryKeys.intakes.detail(i.id), i);
	}
	for (const [id, rows] of Object.entries(files)) {
		queryClient.setQueryData(queryKeys.intakes.files(id, false), {
			pages: [page(rows)],
			pageParams: [undefined],
		});
	}
	const router = createRouter({
		routeTree,
		history: createMemoryHistory({ initialEntries: [path] }),
	});
	await router.load();
	return renderToString(
		createElement(
			SessionSourceProvider,
			{ source: signedIn() },
			createElement(
				ApiOverrideProvider,
				{ queryClient },
				createElement(RouterProvider, { router }),
			),
		),
	);
}

const element = (html: string, testid: string) => {
	const start = html.indexOf(`data-testid="${testid}"`);
	if (start === -1) throw new Error(`no ${testid}`);
	return html.slice(html.lastIndexOf("<", start));
};

describe("the Intakes tab on a client", () => {
	const DRAFT = intake(1);
	const PROPOSED = intake(2, { status: "proposed", proposedBrief: BRIEF });
	const APPROVED = intake(3, { status: "approved" });

	it("is a DataPanel with its count, the status segments counted, and rows newest first", async () => {
		const html = await render(`/clients/${ONE.id}?tab=intakes`, [
			DRAFT,
			PROPOSED,
			APPROVED,
		]);
		expect(html).toMatch(/data-testid="client-intakes-count"[^>]*>3</);
		expect(html).toMatch(
			/data-testid="client-intakes-status-proposed"[^>]*>Proposed<span[^>]*>1</,
		);
		// Newest first: approved (Oct 3), proposed (Oct 2), draft (Oct 1).
		const rows = [APPROVED, PROPOSED, DRAFT].map((i) =>
			html.indexOf(`data-testid="client-intake-${i.id}"`),
		);
		expect(rows).toEqual([...rows].sort((a, b) => a - b));
		expect(rows.every((at) => at > -1)).toBe(true);
	});

	it("links each row to its intake, with its lifecycle on one line", async () => {
		const html = await render(`/clients/${ONE.id}?tab=intakes`, [PROPOSED]);
		expect(tagOf(html, `client-intake-${PROPOSED.id}`)).toContain(
			`href="/clients/${ONE.id}/intakes/${PROPOSED.id}"`,
		);
		expect(
			tagOf(html, `client-intake-${PROPOSED.id}-lifecycle-step-proposed`),
		).toContain('aria-current="step"');
		expect(html).toContain(
			`client-intake-${PROPOSED.id}-lifecycle-step-rejected`,
		);
		// Titled by the brief's summary, not an id.
		expect(html).toContain(">Hold a slot while payment completes<");
	});

	it("says there are none, in words", async () => {
		const html = await render(`/clients/${ONE.id}?tab=intakes`, []);
		expect(html).toContain('data-testid="client-intakes-empty"');
	});
});

describe("one intake's page", () => {
	it("is an approval route, crumbed under its client", () => {
		expect(Route.options.staticData?.device).toBe("approve");
		expect(Route.options.staticData?.crumb).toBe("Intake");
	});

	it("leads with its lifecycle and offers a draft's writes, Propose last", async () => {
		const DRAFT = intake(1);
		const html = await render(`/clients/${ONE.id}/intakes/${DRAFT.id}`, [
			DRAFT,
		]);
		expect(tagOf(html, "intake-lifecycle-step-draft")).toContain(
			'aria-current="step"',
		);
		const actions = element(html, "intake-actions");
		const order = [
			"intake-reject-open",
			"intake-read-open",
			"intake-revise-open",
			"intake-propose",
		].map((id) => actions.indexOf(`data-testid="${id}"`));
		expect(order).toEqual([...order].sort((a, b) => a - b));
		expect(order.every((at) => at > -1)).toBe(true);
		expect(html).not.toContain('data-testid="intake-approve-open"');
		expect(tagOf(html, "intake-back")).toContain(
			`href="/clients/${ONE.id}?tab=intakes"`,
		);
	});

	it("offers Approve on a proposed intake, and nothing on an approved one but its mission", async () => {
		const PROPOSED = intake(2, { status: "proposed", proposedBrief: BRIEF });
		const proposed = await render(`/clients/${ONE.id}/intakes/${PROPOSED.id}`, [
			PROPOSED,
		]);
		expect(proposed).toContain('data-testid="intake-approve-open"');
		expect(proposed).not.toContain('data-testid="intake-propose"');

		const MISSION = "00000000-0000-4000-8000-000000000999";
		const APPROVED = intake(3, {
			status: "approved",
			missionId: MISSION,
			approvedAt: "2026-10-04T09:00:00.000Z",
		});
		const approved = await render(`/clients/${ONE.id}/intakes/${APPROVED.id}`, [
			APPROVED,
		]);
		expect(approved).not.toContain('data-testid="intake-actions"');
		expect(tagOf(approved, "intake-open-mission")).toContain(
			`href="/missions/${MISSION}"`,
		);
	});

	it("checks the brief rule by rule, each issue under its rule", async () => {
		const BAD = intake(4, {
			proposedBrief: {
				...BRIEF,
				acceptanceCriteria: [
					{ id: "AC1", requirementId: "R9", text: "Cites nothing" },
				],
			},
		});
		const html = await render(`/clients/${ONE.id}/intakes/${BAD.id}`, [BAD]);
		expect(tagOf(html, "intake-check-criteria")).toContain(
			'data-state="block"',
		);
		expect(element(html, "intake-check-criteria")).toContain(
			"AC1 cites R9, which is not a requirement",
		);
		expect(tagOf(html, "intake-check-coverage")).toContain(
			'data-state="block"',
		);
		expect(tagOf(html, "intake-check-modules")).toContain('data-state="pass"');
	});

	it("says the repository is unread, and that approval needs it", async () => {
		const DRAFT = intake(1);
		const html = await render(`/clients/${ONE.id}/intakes/${DRAFT.id}`, [
			DRAFT,
		]);
		expect(element(html, "intake-repo-unread")).toContain(
			"Approval needs the cut",
		);
	});

	it("shows a read repository's cut, commit and conventions", async () => {
		const READ = intake(5, {
			repoUrl: "https://github.com/acme/booking",
			repoCommitSha: "0123456789abcdef0123456789abcdef01234567",
			repoReadAt: "2026-10-05T09:00:00.000Z",
			derivedCut: "vertical",
			derivedCutEvidence: "Features under src/features",
			derivedConventions: {
				enforcement: { eslint: [], tsconfig: [], precommit: [], ci: [] },
				confidence: "low",
				unextracted: [],
				naming: {
					files: "kebab",
					exports: "named",
					evidence: [],
					confidence: "low",
					disagreements: ["files: 5 kebab (62%), 3 camel (38%)"],
				},
			},
			derivedBoundaries: [],
		});
		const html = await render(`/clients/${ONE.id}/intakes/${READ.id}`, [READ]);
		expect(html).toMatch(/data-testid="intake-repo-cut"[^>]*>vertical</);
		expect(tagOf(html, "intake-repo-confidence")).toContain(
			'data-confidence="low"',
		);
		expect(html).toContain("naming: files: 5 kebab (62%), 3 camel (38%)");
	});

	const file = (n: number, over: Partial<IntakeFile> = {}): IntakeFile => ({
		id: `00000000-0000-4000-8000-${String(8000 + n).padStart(12, "0")}`,
		name: `call-notes-${n}.md`,
		mime: "text/markdown",
		bytes: 12_700,
		sha256: "a".repeat(64),
		uploadedBy: {
			kind: "operator",
			userId: "00000000-0000-4000-8000-000000000077",
			rosterEntryId: null,
			canonSessionId: null,
			display: "ada",
			agent: null,
		},
		purgedAt: null,
		createdAt: "2026-10-03T09:00:00.000Z",
		updatedAt: "2026-10-03T09:00:00.000Z",
		...over,
	});

	it("lists a draft's files to download, takes drops, and offers a purge", async () => {
		const DRAFT = intake(1);
		const NOTES = file(1);
		const html = await render(
			`/clients/${ONE.id}/intakes/${DRAFT.id}`,
			[DRAFT],
			{ [DRAFT.id]: [NOTES] },
		);
		expect(html).toContain('data-testid="intake-files-drop"');
		expect(html).toContain("Text files up to 10 MB each.");
		const download = tagOf(html, `intake-file-${NOTES.id}-download`);
		expect(download).toContain(`download="${NOTES.name}"`);
		expect(download).toContain(
			`/api/intakes/${DRAFT.id}/files/${NOTES.id}/content`,
		);
		expect(html).toContain(`data-testid="intake-file-${NOTES.id}-purge"`);
		expect(html).toContain(">12.4 KB<");
	});

	it("takes no file and no purge once approved, and shows a purged file as a tombstone", async () => {
		const APPROVED = intake(3, { status: "approved" });
		const GONE = file(2, { purgedAt: "2026-10-04T09:00:00.000Z" });
		const html = await render(
			`/clients/${ONE.id}/intakes/${APPROVED.id}`,
			[APPROVED],
			{ [APPROVED.id]: [GONE] },
		);
		expect(html).not.toContain('data-testid="intake-files-drop"');
		expect(html).not.toContain(`data-testid="intake-file-${GONE.id}-purge"`);
		expect(html).not.toContain(`intake-file-${GONE.id}-download`);
		expect(html).toMatch(
			new RegExp(`data-testid="intake-file-${GONE.id}-purged"[^>]*>Purged `),
		);
	});

	it("says a draft has no files yet, compactly", async () => {
		const DRAFT = intake(1);
		const html = await render(
			`/clients/${ONE.id}/intakes/${DRAFT.id}`,
			[DRAFT],
			{ [DRAFT.id]: [] },
		);
		expect(html).toContain('data-testid="intake-files-empty"');
	});
});
