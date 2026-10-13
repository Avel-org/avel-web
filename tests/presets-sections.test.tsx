import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import type {
	ActivityEntry,
	Playbook,
	PresetApplication,
} from "avel-server/contract";
import type { ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Names } from "@/components/avel/preset-detail";
import {
	changedFieldsOf,
	defaultFor,
	PresetSections,
	versionsOf,
	waveCoverage,
} from "@/components/avel/preset-sections";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ApiProvider } from "@/lib/api";
import { CATALOG_PAGE_SIZE } from "@/lib/api/catalog";
import { queryKeys } from "@/lib/api/keys";
import { PLAYBOOK_PAGE_SIZE } from "@/lib/api/playbooks";
import { staleSince } from "@/lib/api/presets";
import { fakeApi } from "./clients-fixtures";
import { ID, preset, TEMPLATE, template } from "./presets-fixtures";
import { tagOf } from "./render-page";
import { visibleText } from "./visible-text";

const names: Names = {
	status: "success",
	byId: new Map([[TEMPLATE(1), { name: "Atlas", slug: "atlas" }]]),
};

function playbook(overrides: Partial<Playbook> = {}): Playbook {
	return {
		id: ID(90),
		missionType: "booking",
		name: "Booking",
		wavesApplicable: ["A"],
		gates: [],
		deliverable: "pr",
		requiredFields: [],
		defaultPresetId: ID(1),
		version: 1,
		createdAt: "2026-10-01T09:00:00.000Z",
		updatedAt: "2026-10-01T09:00:00.000Z",
		...overrides,
	};
}

/** Inside the real ApiProvider with the catalog and playbooks seeded. */
async function render(
	node: ReactNode,
	playbooks: Playbook[],
	applications: PresetApplication[] = [],
	/** A cursor for the catalog's next page: the catalog is not all loaded. */
	templatesNext: string | null = null,
) {
	const qc = new QueryClient({
		defaultOptions: {
			queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
		},
	});
	qc.setQueryData(queryKeys.catalog.agentTemplates(CATALOG_PAGE_SIZE), {
		pages: [
			{
				data: [template(1, ["foundations", "backend-tests"])],
				meta: { nextCursor: templatesNext },
			},
		],
		pageParams: [undefined],
	});
	qc.setQueryData(queryKeys.playbooks.list(PLAYBOOK_PAGE_SIZE), {
		pages: [{ data: playbooks, meta: { nextCursor: null } }],
		pageParams: [undefined],
	});
	qc.setQueryData(queryKeys.presets.presetApplications(ID(1), 50), {
		pages: [
			{
				data: applications,
				meta: { nextCursor: null, total: applications.length },
			},
		],
		pageParams: [undefined],
	});
	const root = createRootRoute({ component: () => <>{node}</> });
	const router = createRouter({
		routeTree: root.addChildren([
			createRoute({ getParentRoute: () => root, path: "/missions/$id" }),
		]),
		history: createMemoryHistory({ initialEntries: ["/"] }),
	});
	await router.load();
	return renderToString(
		<ApiProvider client={fakeApi().client}>
			<QueryClientProvider client={qc}>
				<TooltipProvider>
					<RouterProvider router={router} />
				</TooltipProvider>
			</QueryClientProvider>
		</ApiProvider>,
	);
}

describe("a preset's overview", () => {
	it("marks the waves with at least one agent", () => {
		const coverage = waveCoverage(preset(1).agents);
		expect(coverage.filter((c) => c.covered).map((c) => c.wave)).toEqual([
			"A",
			"B",
		]);
	});

	it("finds the playbooks that default to it", () => {
		const rows = [
			playbook(),
			playbook({ missionType: "x", defaultPresetId: ID(2) }),
		];
		expect(defaultFor(rows, ID(1)).map((p) => p.missionType)).toEqual([
			"booking",
		]);
	});

	it("shows its squad, coverage and the playbooks it is default for", async () => {
		const html = await render(
			<PresetSections preset={preset(1)} names={names} />,
			[playbook()],
		);
		expect(html).toContain('data-testid="preset-wave-coverage"');
		expect(html).toMatch(/data-testid="preset-default-for"[^>]*>Booking</);
	});
});

describe("a preset's history", () => {
	const entry = (action: ActivityEntry["action"], payload = {}) =>
		({ action, payload }) as Pick<ActivityEntry, "action" | "payload">;

	it("reads changed fields only when they are a list of names", () => {
		expect(
			changedFieldsOf(entry("preset.updated", { fields: ["agents", "name"] })),
		).toEqual(["agents", "name"]);
		expect(
			changedFieldsOf(entry("preset.updated", { fields: "agents" })),
		).toEqual([]);
		expect(changedFieldsOf(entry("preset.updated", { fields: [1] }))).toEqual(
			[],
		);
	});

	it("numbers versions only when the whole history is loaded", () => {
		const newestFirst = [
			entry("preset.updated"),
			entry("preset.updated"),
			entry("preset.created"),
		];
		expect(versionsOf(newestFirst, 3)).toEqual([3, 2, 1]);
		expect(versionsOf(newestFirst, 9)).toEqual([null, null, null]);
	});
});

describe("a preset's coverage", () => {
	it("fits a playbook by the contract's check, and says why one does not", async () => {
		const html = await render(
			<PresetSections preset={preset(1)} names={names} />,
			[
				playbook(),
				playbook({ missionType: "late", name: "Late", wavesApplicable: ["C"] }),
			],
		);
		expect(tagOf(html, "preset-fit-booking")).toContain('data-fits="true"');
		expect(tagOf(html, "preset-fit-late")).toContain('data-fits="false"');
		expect(html).toContain('data-testid="coherence-block"');
		expect(html).toContain("applied agents start active");
	});
});

describe("a preset's used-by", () => {
	const app = (
		n: number,
		overrides: Partial<PresetApplication> = {},
	): PresetApplication => ({
		missionId: ID(100 + n),
		mission: { status: "draft", type: "booking" },
		presetVersion: 3,
		appliedAt: "2026-10-05T09:00:00.000Z",
		actor: { kind: "operator", userId: ID(200), display: "javaris" },
		added: 4,
		removed: 1,
		...overrides,
	});

	it("marks an application made from an older version", () => {
		expect(staleSince({ presetVersion: 1 }, { version: 3 })).toBe(3);
		expect(staleSince({ presetVersion: 3 }, { version: 3 })).toBeNull();
	});

	it("lists each mission it was applied to, linked, with the version and counts", async () => {
		const html = await render(
			<PresetSections preset={preset(1, { version: 3 })} names={names} />,
			[],
			[app(1), app(2, { presetVersion: 1 }), app(3, { mission: null })],
		);
		expect(html).toMatch(
			new RegExp(`href="/missions/${ID(101)}"[^>]*>booking · draft<`),
		);
		expect(html).not.toContain(`preset-application-stale-${ID(101)}`);
		expect(html).toMatch(
			new RegExp(
				`data-testid="preset-application-stale-${ID(102)}"[^>]*>now v3<`,
			),
		);
		expect(html).toContain(">Deleted mission<");
		expect(html).toContain(`title="${ID(103)}"`);
		expect(visibleText(html)).not.toContain(ID(103).slice(0, 8));
		expect(html).not.toContain(`preset-application-link-${ID(103)}`);
		expect(html).toContain("+4 −1");
	});

	it("says when no mission has applied it", async () => {
		const html = await render(
			<PresetSections preset={preset(1)} names={names} />,
			[],
		);
		expect(tagOf(html, "preset-used-by")).toContain('data-state="empty"');
	});
});

describe("coverage with a catalog longer than one page", () => {
	it("waits for every page rather than calling a template unknown", async () => {
		const html = await render(
			<PresetSections preset={preset(1)} names={names} />,
			[playbook()],
			[],
			"next-page",
		);
		expect(html).toContain('data-testid="preset-coverage-loading"');
		expect(html).not.toContain('data-testid="preset-coverage-unknown"');
	});
});
