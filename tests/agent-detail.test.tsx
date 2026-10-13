import type {
	AgentAccess,
	AgentRosterEntry,
	GrantRow,
} from "avel-server/contract";
import { describe, expect, it } from "vitest";
import {
	AccessTable,
	credentialSystems,
	entryLabel,
	entryReadOnlyReason,
	hiddenTools,
	MODE_LABEL,
	rowsOf,
} from "@/components/avel/agent-access";
import {
	AGENT_TABS,
	AgentDetail,
	agentFacts,
	agentStanding,
	sinceLabel,
} from "@/components/avel/agent-detail";
import { overridesOf, withRowMode } from "@/lib/api/access";
import { queryKeys } from "@/lib/api/keys";
import {
	agent,
	inProviders,
	notFoundError,
	seededClient,
} from "./catalog-fixtures";
import { tagOf } from "./render-page";

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

const noop = () => {};
/** The disabled attribute itself, not a disabled: utility in a class. */
const DISABLED = / disabled=""/;
const atlas = agent("atlas");
const SKILL = "c83884a9-5eed-4000-8000-000000000121";
const MISSION = "3fcd1ce4-5eed-4000-8000-000000000036";
const ENTRY = "11111111-5eed-4000-8000-000000000001";

const read: GrantRow = {
	kind: "grant",
	skillId: SKILL,
	skillSlug: "schema-inspector",
	grant: "db:read",
	system: "db",
	derivedMode: "read",
	mode: "read",
};
const migrate: GrantRow = {
	...read,
	grant: "db:migrate",
	derivedMode: "write_held",
	mode: "write_held",
};

const ACCESS: AgentAccess = {
	enforced: false,
	rows: [
		{ kind: "repository", mode: "write_held", scope: ["src/db/**"] },
		read,
		migrate,
		{ kind: "delivery", mode: "send_after_approval" },
	],
	staleOverrides: [],
};

const entry = (
	status: AgentRosterEntry["mission"]["status"],
): AgentRosterEntry => ({
	entryId: ENTRY,
	missionId: MISSION,
	mission: { type: "template-booking", status, sprintN: 1, engagementId: null },
	active: true,
	territory: null,
});

function render({
	tab = "overview" as (typeof AGENT_TABS)[number],
	mission,
	entries = [entry("draft")],
	entryAccess = ACCESS,
}: {
	tab?: (typeof AGENT_TABS)[number];
	mission?: string;
	entries?: AgentRosterEntry[];
	entryAccess?: AgentAccess;
} = {}) {
	const client = seededClient({ agentBySlug: { atlas } });
	client.setQueryData(queryKeys.roster.byTemplate(atlas.id), entries);
	client.setQueryData(queryKeys.catalog.agentAccess(atlas.id), ACCESS);
	client.setQueryData(queryKeys.roster.access(MISSION, ENTRY), entryAccess);
	return inProviders(
		<AgentDetail
			slug="atlas"
			tab={tab}
			mission={mission}
			onTab={noop}
			onMission={noop}
		/>,
		client,
		"/catalog/agents/atlas",
	);
}

describe("the agent banner's words", () => {
	it("names the month an agent was made, from UTC", () => {
		expect(sinceLabel("2026-03-31T23:59:00.000Z")).toBe("March 2026");
	});

	it("reads kind, waves, since and version on one line", () => {
		expect(agentFacts(atlas)).toBe(
			`Build agent · wave B · since September 2026 · v${atlas.version}`,
		);
	});

	it("says a state word, working only while a mission it is on is active", () => {
		expect(agentStanding([])).toEqual({
			label: "Not on a mission",
			live: false,
		});
		expect(agentStanding(["draft"])).toEqual({ label: "Idle", live: false });
		expect(agentStanding(["active", "draft", "active"])).toEqual({
			label: "Working",
			live: true,
		});
	});
});

describe("access overrides, built on the server's rows", () => {
	it("turning a tool off writes none; back on drops the override", () => {
		expect(withRowMode([], migrate, "none")).toEqual([
			{ skillId: SKILL, grant: "db:migrate", mode: "none" },
		]);
		const off = withRowMode([], migrate, "none");
		expect(
			withRowMode(off, { ...migrate, mode: "none" }, "write_held"),
		).toEqual([]);
	});

	it("narrows write holds to read, and never sends a widening mode", () => {
		expect(withRowMode([], migrate, "read")).toEqual([
			{ skillId: SKILL, grant: "db:migrate", mode: "read" },
		]);
		expect(withRowMode([], read, "write_held")).toEqual([]);
	});

	it("reads the overrides in force back from the rows, stale ones left out", () => {
		const narrowed: AgentAccess = {
			...ACCESS,
			rows: [read, { ...migrate, mode: "none" }],
			staleOverrides: [{ skillId: SKILL, grant: "db:gone", mode: "none" }],
		};
		expect(overridesOf(narrowed)).toEqual([
			{ skillId: SKILL, grant: "db:migrate", mode: "none" },
		]);
	});

	it("keys rows by kind, and tool rows by skill and grant", () => {
		expect(rowsOf(ACCESS).map((r) => r.key)).toEqual([
			"repository",
			`grant:${SKILL}:db:read`,
			`grant:${SKILL}:db:migrate`,
			"delivery",
		]);
	});

	it("allows changes only on an active entry of a draft mission", () => {
		expect(entryReadOnlyReason("draft", true)).toBeNull();
		expect(entryReadOnlyReason("active", true)).not.toBeNull();
		expect(entryReadOnlyReason("draft", false)).toMatch(/off the mission/);
	});

	it("labels a mission choice in words: type, sprint, territory and status", () => {
		expect(entryLabel({ ...entry("draft"), territory: "billing" })).toBe(
			"template-booking, sprint 1, billing (draft)",
		);
		expect(entryLabel(entry("active"))).toBe(
			"template-booking, sprint 1 (active)",
		);
	});
});

describe("/catalog/agents/:slug", () => {
	it("heads with the banner: back, name, facts, standing, numbers and actions", () => {
		const html = render({ entries: [entry("active")] });
		expect(tagOf(html, "agent-banner-back")).toContain(
			'href="/catalog/agents"',
		);
		expect(html).toContain('data-testid="agent-banner-name"');
		expect(html).toContain(agentFacts(atlas));
		expect(tagOf(html, "agent-banner-status")).toContain("data-live");
		expect(element(html, "agent-banner-status")).toContain("Working");
		// The numbers are live: missions and running from the roster entries,
		// tools from its own access, roles from the agent. No sample pill.
		const stat = (id: string) => element(html, `agent-stat-${id}`);
		expect(stat("missions")).toContain(">1<");
		expect(stat("missions")).toContain(">mission<");
		expect(stat("running")).toContain(">1<");
		expect(stat("tools")).toContain(">2<");
		expect(stat("roles")).toContain(`>${atlas.roles.length}<`);
		expect(html).not.toContain('data-testid="agent-stat-tokens"');
		expect(element(html, "agent-banner")).not.toContain("sample-data");
		// Ask and Pause are real controls, disabled with their reasons.
		expect(tagOf(html, "agent-ask")).toMatch(DISABLED);
		expect(tagOf(html, "agent-pause")).toMatch(DISABLED);
	});

	it("has every tab, counting only Tools and access, from its access rows", () => {
		const html = render();
		for (const id of AGENT_TABS)
			expect(html).toContain(`data-testid="agent-banner-tab-${id}"`);
		expect(element(html, "agent-banner-tab-tools-count")).toContain(
			`>${ACCESS.rows.length}<`,
		);
		for (const id of ["overview", "performance", "memory"])
			expect(html).not.toContain(`agent-banner-tab-${id}-count"`);
		// On a mission it counts that entry's rows, the ones the table shows.
		const onMission = render({
			mission: MISSION,
			entryAccess: { ...ACCESS, rows: [read, migrate] },
		});
		expect(element(onMission, "agent-banner-tab-tools-count")).toContain(">2<");
	});

	it("says so when no agent has the slug", () => {
		const client = seededClient({
			agentBySlug: {
				ghost: notFoundError("/api/agent-templates/by-slug/ghost"),
			},
		});
		const html = inProviders(
			<AgentDetail
				slug="ghost"
				tab="overview"
				mission={undefined}
				onTab={noop}
				onMission={noop}
			/>,
			client,
			"/catalog/agents/ghost",
		);
		expect(html).toContain('data-testid="agent-detail-not-found"');
	});

	it("shows the template's own access, read-only, without a mission", () => {
		const html = render({ tab: "tools" });
		expect(html).toContain('data-testid="agent-access-table"');
		expect(html).toContain(MODE_LABEL.write_held);
		expect(html).toContain(MODE_LABEL.send_after_approval);
		expect(tagOf(html, `agent-access-toggle-${SKILL}-db:migrate`)).toMatch(
			DISABLED,
		);
		expect(html).toContain("Recorded, not enforced");
	});

	it("lets a draft mission's entry turn a tool off", () => {
		const html = render({ tab: "tools", mission: MISSION });
		expect(tagOf(html, `agent-access-toggle-${SKILL}-db:migrate`)).not.toMatch(
			DISABLED,
		);
	});

	it("holds an active mission's access still, and says why", () => {
		const html = render({
			tab: "tools",
			mission: MISSION,
			entries: [entry("active")],
		});
		expect(tagOf(html, `agent-access-toggle-${SKILL}-db:migrate`)).toMatch(
			DISABLED,
		);
	});

	it("says when a limit no longer matches a tool", () => {
		const html = render({
			tab: "tools",
			mission: MISSION,
			entryAccess: {
				...ACCESS,
				staleOverrides: [{ skillId: SKILL, grant: "db:gone", mode: "none" }],
			},
		});
		expect(html).toContain('data-testid="agent-access-stale"');
		expect(html).toContain("no longer matches a tool");
	});

	it("shows a narrowed row's mode and what it was limited from", () => {
		const html = inProviders(
			<AccessTable
				access={{ ...ACCESS, rows: [{ ...migrate, mode: "read" }] }}
				readOnly={null}
				onRowMode={noop}
			/>,
			seededClient(),
			"/catalog/agents/atlas",
		);
		expect(html).toContain("limited from Write holds");
	});

	it("names the module behind each region it can't show yet", () => {
		const html = render({ tab: "tools" });
		for (const id of [
			"agent-credentials",
			"agent-cannot-see",
			"agent-access-requests",
		])
			expect(html).toContain(`data-testid="${id}"`);
		expect(html).toContain("module 6");
		expect(html).toContain("module 7");
		expect(html).toContain("module 8");
	});

	it("lists a credential per system it may touch, and what is turned off", () => {
		expect(credentialSystems(ACCESS)).toEqual(["Repository", "db"]);
		const off: AgentAccess = {
			...ACCESS,
			rows: [read, { ...migrate, system: "github", mode: "none" }],
		};
		// A tool turned off holds no credential, and is what it cannot see.
		expect(credentialSystems(off)).toEqual(["db"]);
		expect(hiddenTools(off).map((r) => r.grant)).toEqual(["db:migrate"]);
		const html = render({ tab: "tools" });
		expect(html).toContain('data-testid="agent-credential-Repository"');
		expect(html).toContain("No tool is turned off here.");
	});
});
