import { QueryClient } from "@tanstack/react-query";
import {
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import {
	type ExportWire,
	exportSchema,
	type MissionDetail,
} from "avel-server/contract";
import type { ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
	briefDispatchId,
	checkStates,
	DeliveryChecks,
	PackageFacts,
	PackageMap,
	packageBriefs,
	packageEntries,
} from "@/components/avel/export-package";
import { ExportPreflight } from "@/components/avel/export-preflight";
import { ExportStatus } from "@/components/avel/export-status";
import {
	choiceChanged,
	choiceOf,
	choiceProblem,
	deliverBodyOf,
	previewBodyOf,
	targetOffReason,
	ZIP_CHOICE,
} from "@/components/avel/export-target";
import { MissionExportList } from "@/components/avel/mission-exports";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ApiError, ApiOverrideProvider, ApiProvider } from "@/lib/api";
import {
	exportAttemptFor,
	exportPollMs,
	refreshable,
	writtenExportId,
} from "@/lib/api/exports";
import { queryKeys } from "@/lib/api/keys";
import { tagOf } from "./render-page";

// ---------------------------------------------------------------------------
// Fixtures, parsed through the contract's own schema.

const MISSION = "00000000-0000-4000-8000-000000000001";
const PREVIEW = "00000000-0000-4000-8000-000000000501";
const RUN = "00000000-0000-4000-8000-000000000101";
const DELIVERED = "00000000-0000-4000-8000-000000000502";
const CONNECTION = "00000000-0000-4000-8000-000000000701";
const ENGAGEMENT = "00000000-0000-4000-8000-000000000801";
const sha = (c: string, n: number) => c.repeat(n);

const exp = (extra: Partial<ExportWire> = {}): ExportWire =>
	exportSchema.parse({
		id: PREVIEW,
		missionId: MISSION,
		sprintN: 2,
		targetKind: "zip",
		connectionId: null,
		status: "previewed",
		statusChangedAt: "2026-10-22T10:00:00.000Z",
		dryRun: true,
		previewExportId: null,
		pullRequest: null,
		push: null,
		failure: null,
		gateRun: {
			id: RUN,
			result: "verified",
			commitSha: sha("c", 40),
			baseSha: sha("b", 40),
			receiptSha256: sha("d", 64),
		},
		baseRef: null,
		baseCommitSha: null,
		package: {
			sha256: sha("e", 64),
			hashVersion: 1,
			files: [
				{
					path: "src/booking/slots.ts",
					mode: "100644",
					bytes: 2048,
					blobSha: sha("1", 40),
					change: "overwrite",
				},
				{
					path: "src/booking/form.tsx",
					mode: "100644",
					bytes: 900,
					blobSha: sha("2", 40),
					change: "create",
				},
				{
					path: "scripts/seed.sh",
					mode: "100755",
					bytes: 120,
					blobSha: sha("3", 40),
					change: "create",
				},
			],
			deletes: ["src/booking/old.ts"],
		},
		violations: [],
		blastRadius: null,
		blocked: null,
		zip: null,
		createdAt: "2026-10-22T10:00:00.000Z",
		updatedAt: "2026-10-22T10:00:00.000Z",
		...extra,
	});

const NOT_VERIFIED = {
	code: "PRECONDITION_FAILED",
	reason: "gate_pass_not_verified",
	message: "m",
} as const;

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
					<TooltipProvider>{node}</TooltipProvider>
				</ApiProvider>
			</ApiOverrideProvider>
		),
	});
	const router = createRouter({
		routeTree: root.addChildren([
			createRoute({
				getParentRoute: () => root,
				path: "/missions/$id/exports/$exportId",
			}),
		]),
		history: createMemoryHistory({ initialEntries: ["/"] }),
	});
	await router.load();
	return renderToString(<RouterProvider router={router} />);
}

function element(html: string, testid: string): string {
	const at = html.indexOf(`data-testid="${testid}"`);
	expect(at, testid).toBeGreaterThan(-1);
	return html.slice(html.lastIndexOf("<", at));
}

// ---------------------------------------------------------------------------

describe("the package", () => {
	it("lists files and deletes in codepoint order, each with its path's violations", () => {
		const entries = packageEntries(
			exp({
				violations: [
					{ code: "PROTECTED_PATH", path: "scripts/seed.sh", detail: "d" },
				],
			}),
		);
		expect(entries.map((e) => `${e.change}:${e.path}`)).toEqual([
			"create:scripts/seed.sh",
			"create:src/booking/form.tsx",
			"delete:src/booking/old.ts",
			"overwrite:src/booking/slots.ts",
		]);
		expect(entries[0]?.violations.map((v) => v.code)).toEqual([
			"PROTECTED_PATH",
		]);
	});

	it("groups by folder, marks a deleted path and an executable one", async () => {
		const html = await render(<PackageMap exp={exp()} />);
		expect(html).toContain('data-testid="export-package-folder-src/booking"');
		expect(html).toContain('data-testid="export-package-folder-scripts"');
		expect(tagOf(html, "export-file-src/booking/old.ts")).toContain(
			'data-change="delete"',
		);
		expect(element(html, "export-file-scripts/seed.sh")).toContain(
			"executable",
		);
		// Nothing is refused, so the filter offers no Refused segment.
		expect(html).not.toContain(
			'data-testid="export-package-filter-violations"',
		);
	});

	it("opens on the refused paths when there are any, each naming its rule", async () => {
		const html = await render(
			<PackageMap
				exp={exp({
					violations: [
						{
							code: "PATH_OUTSIDE_ALLOWED",
							path: "src/booking/slots.ts",
							detail: "Outside the writable paths",
						},
					],
				})}
			/>,
		);
		expect(tagOf(html, "export-package-filter-violations")).toContain(
			'aria-pressed="true"',
		);
		expect(html).toContain(
			'data-testid="export-violation-PATH_OUTSIDE_ALLOWED-src/booking/slots.ts"',
		);
		// The filter shows only the refused file.
		expect(html).not.toContain('data-testid="export-file-scripts/seed.sh"');
	});

	it("lists the dispatch briefs apart from the work's files", async () => {
		const RUN_ID = "00000000-0000-4000-8000-000000000301";
		const brief = {
			path: `.avel/dispatches/${RUN_ID}.md`,
			mode: "100644",
			bytes: 1500,
			blobSha: sha("4", 40),
			change: "create" as const,
		};
		const pkg = exp().package;
		if (pkg === null) throw new Error("the fixture renders a package");
		const withBrief = exp({
			package: { ...pkg, files: [brief, ...pkg.files] },
		});
		expect(packageBriefs(withBrief)).toEqual([
			{ dispatchId: RUN_ID, bytes: 1500 },
		]);
		// The map, its folders and its counts are what the work wrote.
		expect(packageEntries(withBrief).map((e) => e.path)).not.toContain(
			brief.path,
		);
		const html = await render(<PackageMap exp={withBrief} />);
		expect(html).not.toContain('data-testid="export-package-folder-.avel');
		expect(tagOf(html, `export-brief-open-${RUN_ID}`)).toContain("button");
		expect(element(html, "export-package-briefs")).toContain("Dispatch briefs");
		// A work path that only looks like one is still the work's.
		expect(briefDispatchId(".avel/dispatches/notes.md")).toBeNull();
	});

	it("names the zip's deletes file, which a GitHub delivery doesn't carry", async () => {
		const html = await render(<PackageMap exp={exp()} />);
		expect(html).toContain(".avel/deletes.json");
	});
});

describe("the delivery check", () => {
	it("passes every guard when nothing would refuse", () => {
		expect(checkStates(exp())).toEqual(["pass", "pass", "pass", "pass"]);
	});

	it("stops at the first refusal: the checks after it are not reached", () => {
		expect(checkStates(exp({ blocked: NOT_VERIFIED }))).toEqual([
			"block",
			"pending",
			"pending",
			"pending",
		]);
		expect(
			checkStates(
				exp({
					blocked: {
						code: "PREVIEW_STALE",
						reason: "preview_stale",
						message: "m",
					},
				}),
			),
		).toEqual(["pass", "pass", "block", "pending"]);
	});

	it("blocks the paths check on a refused path, whichever guard stopped first", () => {
		expect(
			checkStates(
				exp({
					blocked: NOT_VERIFIED,
					violations: [
						{ code: "PROTECTED_PATH", path: "scripts/seed.sh", detail: "d" },
					],
				}),
			),
		).toEqual(["block", "block", "pending", "pending"]);
	});

	it("says why in the error map's words, never the server's message", async () => {
		const html = await render(
			<DeliveryChecks
				exp={exp({ blocked: { ...NOT_VERIFIED, message: "SERVER TEXT" } })}
			/>,
		);
		const check = element(html, "export-check-verified");
		expect(check).toContain("only verified work ships");
		expect(html).not.toContain("SERVER TEXT");
	});
});

describe("pre-flight", () => {
	const withPreview = (preview: ExportWire) => (qc: QueryClient) => {
		qc.setQueryData([...queryKeys.gate.runs(MISSION)], {
			pages: [{ data: [], meta: { nextCursor: null, total: 0 } }],
			pageParams: [undefined],
		});
		qc.setQueryData([...queryKeys.exports.detail(preview.id)], preview);
	};
	const flight = (preview: ExportWire) =>
		render(
			<ExportPreflight
				missionId={MISSION}
				previewId={preview.id}
				onPreviewed={() => {}}
				onDelivered={() => {}}
			/>,
			withPreview(preview),
		);

	it("holds Deliver while a delivery check blocks it", async () => {
		const html = await flight(exp({ blocked: NOT_VERIFIED }));
		expect(tagOf(html, "export-deliver")).toMatch(/\sdisabled=""/);
		expect(tagOf(html, "export-check-verified")).toContain(
			'data-state="block"',
		);
	});

	it("offers Deliver, held to confirm, when every check passes", async () => {
		const html = await flight(exp());
		expect(tagOf(html, "export-deliver")).not.toMatch(/\sdisabled=""/);
	});

	it("offers a pull request only on a client mission, and never a push", async () => {
		const html = await flight(exp());
		expect(tagOf(html, "export-target-zip")).toContain('aria-pressed="true"');
		// No engagement read: an internal mission has no repository.
		expect(tagOf(html, "export-target-github_pr")).toMatch(/\sdisabled=""/);
		expect(tagOf(html, "export-target-github_push")).toMatch(/\sdisabled=""/);
	});

	it("starts from a pull request preview's target, and delivers it as one", async () => {
		const preview = exp({
			targetKind: "github_pr",
			connectionId: CONNECTION,
			baseRef: "main",
		});
		const html = await render(
			<ExportPreflight
				missionId={MISSION}
				previewId={preview.id}
				onPreviewed={() => {}}
				onDelivered={() => {}}
			/>,
			(qc) => {
				withPreview(preview)(qc);
				// Only the engagement is read off the mission.
				qc.setQueryData([...queryKeys.missions.detail(MISSION)], {
					engagement: { id: ENGAGEMENT, name: "Acme" },
				} as unknown as MissionDetail);
			},
		);
		expect(tagOf(html, "export-target-github_pr")).toContain(
			'aria-pressed="true"',
		);
		expect(tagOf(html, "export-target-github_pr")).not.toMatch(/\sdisabled=""/);
		expect(tagOf(html, "export-ref")).toContain('value="main"');
		expect(element(html, "export-deliver")).toContain(
			"Hold to open pull request",
		);
	});

	it("delivers a push preview as a push, never as a zip", async () => {
		const preview = exp({
			targetKind: "github_push",
			connectionId: CONNECTION,
			baseRef: "avel/sprint-2",
		});
		const html = await render(
			<ExportPreflight
				missionId={MISSION}
				previewId={preview.id}
				onPreviewed={() => {}}
				onDelivered={() => {}}
			/>,
			(qc) => {
				withPreview(preview)(qc);
				qc.setQueryData([...queryKeys.missions.detail(MISSION)], {
					engagement: { id: ENGAGEMENT, name: "Acme" },
				} as unknown as MissionDetail);
			},
		);
		const deliver = element(html, "export-deliver");
		expect(deliver).toContain("Hold to push");
		expect(deliver).not.toContain("zip");
	});
});

describe("a GitHub pull request export", () => {
	const OPEN_PR = {
		number: 42,
		url: "https://github.com/acme/booking/pull/42",
		branch: "avel/00000000-s2-eeeeeeeeeeee",
		commitSha: sha("a", 40),
		state: "open",
	} as const;
	const pr = (extra: Partial<ExportWire> = {}) =>
		exp({
			id: DELIVERED,
			dryRun: false,
			targetKind: "github_pr",
			connectionId: CONNECTION,
			baseRef: "main",
			previewExportId: PREVIEW,
			status: "pr-open",
			pullRequest: OPEN_PR,
			...extra,
		});
	const page = (shown: ExportWire) =>
		render(<ExportStatus missionId={MISSION} exportId={shown.id} />, (qc) =>
			qc.setQueryData([...queryKeys.exports.detail(shown.id)], shown),
		);

	it("previews and delivers the target it chose, through its connection", () => {
		const choice = {
			target: "github_pr" as const,
			connectionId: CONNECTION,
			ref: " release ",
		};
		expect(previewBodyOf(MISSION, choice)).toEqual({
			missionId: MISSION,
			target: "github_pr",
			connectionId: CONNECTION,
			ref: "release",
		});
		expect(previewBodyOf(MISSION, { ...choice, ref: "" })).not.toHaveProperty(
			"ref",
		);
		expect(previewBodyOf(MISSION, { ...ZIP_CHOICE })).toEqual({
			missionId: MISSION,
			target: "zip",
		});
		const preview = exp({
			targetKind: "github_pr",
			connectionId: CONNECTION,
			baseRef: "main",
		});
		expect(deliverBodyOf(preview)).toEqual({
			missionId: MISSION,
			target: "github_pr",
			connectionId: CONNECTION,
			ref: "main",
			gateRunId: RUN,
			previewExportId: PREVIEW,
		});
		expect(deliverBodyOf(exp())).toEqual({
			missionId: MISSION,
			target: "zip",
			gateRunId: RUN,
			previewExportId: PREVIEW,
		});
	});

	it("has nothing to deliver, describe or list for an export that stopped before it rendered", () => {
		// gateRun and package are null together, with no violations and no block.
		const unrendered = exp({
			status: "failed",
			gateRun: null,
			package: null,
			violations: [],
			blocked: null,
		});
		expect(deliverBodyOf(unrendered)).toBeNull();
		expect(packageEntries(unrendered)).toEqual([]);
		expect(packageBriefs(unrendered)).toEqual([]);
		const facts = renderToString(<PackageFacts exp={unrendered} />);
		expect(facts).toContain('data-testid="export-facts-unrendered"');
		expect(facts).not.toContain("export-package-sha");
	});

	it("asks for a new preview when the target moved off the previewed one", () => {
		const preview = exp({
			targetKind: "github_pr",
			connectionId: CONNECTION,
			baseRef: "main",
		});
		const same = choiceOf(preview);
		expect(choiceChanged(same, preview)).toBe(false);
		// A blank branch is whichever the preview resolved to.
		expect(choiceChanged({ ...same, ref: "" }, preview)).toBe(false);
		expect(choiceChanged({ ...same, ref: "release" }, preview)).toBe(true);
		expect(choiceChanged(ZIP_CHOICE, preview)).toBe(true);
		expect(choiceChanged(ZIP_CHOICE, null)).toBe(false);
		expect(choiceProblem({ ...same, connectionId: "" })).toBe(
			"Choose a connection",
		);
		expect(targetOffReason("github_pr", null)).toBe(
			"Only a client mission has a repository to deliver to",
		);
		expect(targetOffReason("github_pr", ENGAGEMENT)).toBeNull();
		// Not yet "an internal mission" while the mission still reads.
		expect(targetOffReason("github_pr", undefined)).toBe("Reading the mission");
	});

	it("offers a push like a pull request: a client mission's, through a connection, to a branch", () => {
		expect(targetOffReason("github_push", ENGAGEMENT)).toBeNull();
		expect(targetOffReason("github_push", null)).toBe(
			"Only a client mission has a repository to deliver to",
		);
		const pushed = exp({
			targetKind: "github_push",
			connectionId: CONNECTION,
			baseRef: "avel/sprint-2",
		});
		expect(choiceOf(pushed)).toEqual({
			target: "github_push",
			connectionId: CONNECTION,
			ref: "avel/sprint-2",
		});
	});

	it("reads a delivering export every 3 s, an open pull request every 15 s, and a settled one never", () => {
		expect(exportPollMs({ status: "delivering" })).toBe(3_000);
		expect(exportPollMs({ status: "pr-open" })).toBe(15_000);
		expect(exportPollMs({ status: "done" })).toBe(false);
		expect(exportPollMs(undefined)).toBe(false);
	});

	it("names the branch and commit a done push wrote", async () => {
		const done = exp({
			targetKind: "github_push",
			dryRun: false,
			connectionId: CONNECTION,
			status: "done",
			push: { branch: "avel/sprint-2", commitSha: "c".repeat(40) },
		});
		const html = await page(done);
		expect(element(html, "export-status-push-branch")).toContain(
			"avel/sprint-2",
		);
		expect(html).toContain('data-testid="export-status-push-commit"');
		expect(html).not.toContain('data-testid="export-status-pr"');
	});

	it("links the pull request on GitHub and offers to check it there", async () => {
		const html = await page(pr());
		expect(tagOf(html, "export-status-pr-link")).toContain(
			'href="https://github.com/acme/booking/pull/42"',
		);
		expect(element(html, "export-status-pr-link")).toContain(
			"Pull request #42",
		);
		expect(element(html, "export-status-pr-state")).toContain("Open on GitHub");
		expect(tagOf(html, "export-status-pr-refresh")).not.toMatch(
			/\sdisabled=""/,
		);
		expect(refreshable(pr())).toBe(true);
		expect(refreshable(pr({ status: "delivering", pullRequest: null }))).toBe(
			true,
		);
	});

	it("stops checking once GitHub merged it", async () => {
		const merged = pr({
			status: "done",
			pullRequest: { ...OPEN_PR, state: "merged" },
		});
		const html = await page(merged);
		expect(element(html, "export-status-pr-state")).toContain(
			"Merged on GitHub",
		);
		expect(html).not.toContain('data-testid="export-status-pr-refresh"');
		expect(refreshable(merged)).toBe(false);
	});

	it("says what GitHub answered on a failed export, and links it from a refusal", async () => {
		const html = await page(
			pr({
				status: "failed",
				pullRequest: null,
				push: null,
				failure: {
					code: "GITHUB_REJECTED",
					message: "GitHub refused the branch: it already exists.",
				},
			}),
		);
		expect(element(html, "export-status-failure")).toContain(
			"GitHub refused the branch: it already exists.",
		);
		const refused = new ApiError({
			method: "POST",
			path: "/api/exports",
			kind: "contract",
			status: 502,
			code: "GITHUB_REJECTED",
			message: "m",
			requestId: "req_x",
			details: { exportId: DELIVERED },
		} as ConstructorParameters<typeof ApiError>[0]);
		expect(writtenExportId(refused)).toBe(DELIVERED);
		expect(writtenExportId(null)).toBeNull();
	});
});

describe("a mission's exports", () => {
	it("links each export to its status page, newest first", async () => {
		const done = exp({
			id: "00000000-0000-4000-8000-000000000502",
			dryRun: false,
			status: "done",
			previewExportId: PREVIEW,
			zip: { sha256: sha("f", 64), bytes: 4096 },
		});
		const html = await render(<MissionExportList missionId={MISSION} />, (qc) =>
			qc.setQueryData([...queryKeys.exports.list(MISSION)], {
				pages: [{ data: [done, exp()], meta: { nextCursor: null } }],
				pageParams: [undefined],
			}),
		);
		const first = html.indexOf(`mission-export-${done.id}`);
		expect(first).toBeGreaterThan(-1);
		expect(first).toBeLessThan(html.indexOf(`mission-export-${PREVIEW}`));
		expect(tagOf(html, `mission-export-${done.id}`)).toContain(
			`href="/missions/${MISSION}/exports/${done.id}"`,
		);
		expect(element(html, `mission-export-${PREVIEW}`)).toContain("Zip preview");
	});
});

describe("an export attempt", () => {
	it("keeps its key for the same body, so a resend replays", () => {
		const body = { missionId: MISSION, target: "zip" as const };
		const first = exportAttemptFor(null, body, () => "k1");
		expect(exportAttemptFor(first, { ...body }, () => "k2").key).toBe("k1");
		expect(
			exportAttemptFor(first, { ...body, missionId: PREVIEW }, () => "k2").key,
		).toBe("k2");
	});
});
