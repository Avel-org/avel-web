import { QueryClient } from "@tanstack/react-query";
import {
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import { type ExportWire, exportSchema } from "avel-server/contract";
import type { ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
	briefDispatchId,
	checkStates,
	DeliveryChecks,
	PackageMap,
	packageBriefs,
	packageEntries,
} from "@/components/avel/export-package";
import { ExportPreflight } from "@/components/avel/export-preflight";
import { MissionExportList } from "@/components/avel/mission-exports";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ApiOverrideProvider, ApiProvider } from "@/lib/api";
import { exportAttemptFor } from "@/lib/api/exports";
import { queryKeys } from "@/lib/api/keys";
import { tagOf } from "./render-page";

// ---------------------------------------------------------------------------
// Fixtures, parsed through the contract's own schema.

const MISSION = "00000000-0000-4000-8000-000000000001";
const PREVIEW = "00000000-0000-4000-8000-000000000501";
const RUN = "00000000-0000-4000-8000-000000000101";
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
		const withBrief = exp({
			package: { ...exp().package, files: [brief, ...exp().package.files] },
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

	it("offers only a zip until GitHub delivery is built", async () => {
		const html = await flight(exp());
		expect(tagOf(html, "export-target-zip")).toContain('aria-pressed="true"');
		expect(tagOf(html, "export-target-github_pr")).toMatch(/\sdisabled=""/);
		expect(tagOf(html, "export-target-github_push")).toMatch(/\sdisabled=""/);
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
