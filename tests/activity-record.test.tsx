import { QueryClient } from "@tanstack/react-query";
import {
	createMemoryHistory,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import {
	type ActivityEntry,
	activityAction,
	contract,
} from "avel-server/contract";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
	INVERSE,
	labelOf,
	payloadFacts,
	resultOf,
} from "@/components/avel/activity-record";
import { ApiOverrideProvider } from "@/lib/api";
import { ACTIVITY_PAGE_SIZE } from "@/lib/api/activity";
import { queryKeys } from "@/lib/api/keys";
import { SessionSourceProvider } from "@/lib/auth";
import { routeTree } from "../src/routeTree.gen";
import { signedIn } from "./auth-session";
import { tagOf } from "./render-page";
import { visibleText } from "./visible-text";

const ID = (n: number) =>
	`00000000-0000-4000-8000-${String(7000 + n).padStart(12, "0")}`;

function entry(
	n: number,
	overrides: Partial<ActivityEntry> = {},
): ActivityEntry {
	return {
		id: ID(n),
		at: "2026-10-06T10:00:00.000Z",
		actorKind: "operator",
		actorUserId: ID(900),
		actorRosterEntryId: null,
		actorCanonSessionId: null,
		action: "client.created",
		entityType: "client",
		entityId: ID(100 + n),
		missionId: null,
		engagementId: null,
		requestId: `req-${n}`,
		payload: {},
		actor: {
			kind: "operator",
			userId: ID(900),
			rosterEntryId: null,
			canonSessionId: null,
			display: "octo-operator",
			agent: null,
		},
		...overrides,
	};
}

const ADDED = entry(1, {
	action: "roster.entry_added",
	entityType: "roster_entry",
	actorKind: "agent",
	actorUserId: null,
	actorRosterEntryId: ID(501),
	actorCanonSessionId: null,
	actor: {
		kind: "agent",
		userId: null,
		rosterEntryId: ID(501),
		canonSessionId: null,
		display: "Atlas",
		agent: {
			templateId: ID(520),
			slug: "atlas",
			name: "Atlas",
			territory: null,
		},
	},
	payload: { agentTemplateId: ID(500), waves: ["A", "B"], active: true },
});
const CREATED = entry(2);

// ---------------------------------------------------------------------------
// Pure.

describe("INVERSE", () => {
	it("decides every action in the contract, and no other", () => {
		expect(Object.keys(INVERSE).sort()).toEqual(
			[...activityAction.options].sort(),
		);
	});

	it("names only requests the contract has, with their real method and path", () => {
		const routers = contract as unknown as Record<
			string,
			Record<string, { method: string; path: string }>
		>;
		for (const inverse of Object.values(INVERSE)) {
			if (inverse === null) continue;
			const [group, name] = inverse.request.split(".");
			const route = routers[group ?? ""]?.[name ?? ""];
			expect(route, inverse.request).toBeDefined();
			expect(inverse.route).toBe(`${route?.method} ${route?.path}`);
		}
	});
});

describe("the payload", () => {
	it("labels keys as words", () => {
		expect(labelOf("presetVersion")).toBe("Preset version");
		expect(labelOf("check_passed")).toBe("Check passed");
	});

	it("hides ids, shortens hashes, joins plain lists, counts the rest, and says None or Yes/No", () => {
		expect(
			payloadFacts({
				presetId: ID(1),
				added: [ID(2), ID(3)],
				rows: [{ a: 1 }, { a: 2 }],
				removed: [],
				checkPassed: false,
				version: 4,
				contentSha256: "a".repeat(64),
			}).map((f) => [f.label, f.value, f.mono, f.ref]),
		).toEqual([
			["Preset id", "Hidden", false, { kind: "id", full: ID(1) }],
			[
				"Added",
				"2 ids, hidden",
				false,
				{ kind: "id", full: `${ID(2)}, ${ID(3)}` },
			],
			["Rows", "2 items", false, undefined],
			["Removed", "None", false, undefined],
			["Check passed", "No", false, undefined],
			["Version", "4", true, undefined],
			["Content sha256", "", true, { kind: "hash", full: "a".repeat(64) }],
		]);
	});

	it("reads every entry as Applied while refusals are not logged", () => {
		expect(resultOf(ADDED)).toBe("Applied");
	});
});

// ---------------------------------------------------------------------------
// On the page.

async function render(path: string, rows: ActivityEntry[]) {
	const queryClient = new QueryClient({
		defaultOptions: {
			queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
		},
	});
	queryClient.setQueryData(queryKeys.activity.list(ACTIVITY_PAGE_SIZE, {}), {
		pages: [{ data: rows, meta: { nextCursor: null, total: rows.length } }],
		pageParams: [undefined],
	});
	const router = createRouter({
		routeTree,
		history: createMemoryHistory({ initialEntries: [path] }),
	});
	await router.load();
	return renderToString(
		<SessionSourceProvider source={signedIn()}>
			<ApiOverrideProvider queryClient={queryClient}>
				<RouterProvider router={router} />
			</ApiOverrideProvider>
		</SessionSourceProvider>,
	);
}

/** One element by test id, from its opening tag to its matching close. */
function element(html: string, testid: string): string {
	const at = html.indexOf(`data-testid="${testid}"`);
	expect(at, testid).toBeGreaterThan(-1);
	const start = html.lastIndexOf("<", at);
	const tag = /^<([a-z0-9]+)/.exec(html.slice(start))?.[1] ?? "";
	const re = new RegExp(`<${tag}[\\s>]|</${tag}>`, "g");
	re.lastIndex = start;
	let depth = 0;
	for (let m = re.exec(html); m; m = re.exec(html)) {
		depth += m[0].startsWith("</") ? -1 : 1;
		if (depth === 0) return html.slice(start, m.index + m[0].length);
	}
	return html.slice(start);
}

const text = (html: string) => html.replaceAll("<!-- -->", "");

describe("the audit log", () => {
	it("is a table of time, actor, action, object and result", async () => {
		const html = await render("/activity", [ADDED, CREATED]);
		const table = element(html, "activity-audit");
		for (const head of ["Time", "Actor", "Action", "Object", "Result"]) {
			expect(table).toContain(`>${head}<`);
		}
		expect(element(table, `activity-result-${ADDED.id}`)).toContain(
			">Applied<",
		);
		expect(tagOf(table, `activity-actor-${ADDED.id}`)).toContain(
			'data-actor-kind="agent"',
		);
		expect(tagOf(table, `activity-actor-agent-${ADDED.id}`)).toContain(
			'href="/catalog/agents/atlas"',
		);
	});

	it("has no record until a row is selected", async () => {
		const html = await render("/activity", [ADDED]);
		expect(html).not.toContain('data-testid="activity-record"');
		expect(tagOf(html, `activity-row-${ADDED.id}`)).toContain(
			'aria-selected="false"',
		);
	});

	it("opens the selected entry's decision record from the URL", async () => {
		const html = text(
			await render(`/activity?entry=${ADDED.id}`, [ADDED, CREATED]),
		);
		expect(tagOf(html, `activity-row-${ADDED.id}`)).toContain(
			'aria-selected="true"',
		);
		const record = element(html, "activity-record");
		expect(element(record, "activity-record-did")).toContain(
			"Agent added to roster",
		);
		const did = element(record, "activity-record-did");
		// Tags read as spaces, so the link leaves one before the full stop.
		expect(visibleText(did)).toMatch(/, by Atlas ?./);
		// The agent is a link to its catalog page, never an id.
		expect(tagOf(did, `activity-record-actor-${ADDED.id}`)).toContain(
			'href="/catalog/agents/atlas"',
		);
		const looked = element(record, "activity-record-looked");
		expect(looked).toContain(">Agent template id<");
		expect(looked).toContain(">A, B<");
		expect(tagOf(record, "activity-record-rule-surface")).toContain(
			'data-state="not-built"',
		);
		expect(element(record, "activity-record-confidence")).toContain("n/a");
		const reverse = element(record, "activity-record-reverse");
		expect(reverse).toContain(">roster.remove<");
		expect(reverse).toContain(
			"DELETE /api/missions/:missionId/roster/:entryId",
		);
	});

	it("says there is no inverse when the contract has none", async () => {
		const html = text(
			await render(`/activity?entry=${CREATED.id}`, [ADDED, CREATED]),
		);
		expect(element(html, "activity-record-reverse")).toContain("No inverse");
	});

	it("says so when the selected entry isn't loaded", async () => {
		const html = await render(`/activity?entry=${ID(99)}`, [ADDED]);
		expect(html).toContain('data-testid="activity-record-missing"');
	});

	it("gives each phone row a link to its record", async () => {
		const html = await render("/activity", [ADDED]);
		expect(tagOf(html, `activity-record-open-${ADDED.id}`)).toContain(
			`entry=${ADDED.id}`,
		);
	});
});
