import type {
	ActivityEntry,
	AgentAccess,
	AgentRosterEntry,
	AgentTemplate,
} from "avel-server/contract";
import { Building2, FlaskConical, Hammer, Scale } from "lucide-react";
import type { ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AccessTable, FIXED_REASON } from "@/components/avel/agent-access";
import { byMission } from "@/components/avel/agent-activity";
import {
	AGENT_TABS,
	AgentDetail,
	agentIcon,
	agentPageKey,
	wavesLabel,
} from "@/components/avel/agent-detail";
import {
	IdentityTab,
	isIdentityStub,
	KIND_WORDS,
	ManifestTab,
	MeasuresRegion,
} from "@/components/avel/catalog-agent-inspector";
import { sampleHistory } from "@/components/avel/catalog-placeholders";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AGENT_ACTIVITY_LIMIT } from "@/lib/api/activity";
import { queryKeys } from "@/lib/api/keys";
import { agent, inProviders, seededClient } from "./catalog-fixtures";
import { tagOf } from "./render-page";

/*
 * The agent page's polish (ruling 46): one heading per panel, a stub said
 * plainly, kind in words, counts and links on the banner, a state word,
 * readable missions, an icon tile, waves in the facts, locked rows, activity
 * by mission, folded measures, the pinned banner and the page's keys.
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

const text = (html: string) => html.replace(/<[^>]+>/g, "");
const tip = (node: ReactNode) =>
	renderToString(<TooltipProvider>{node}</TooltipProvider>);
const noop = () => {};

const atlas = agent("atlas");
const MISSION = "3fcd1ce4-5eed-4000-8000-000000000036";
const OTHER = "9abc1ce4-5eed-4000-8000-000000000037";
const ENTRY = "11111111-5eed-4000-8000-000000000001";
const ENTRY2 = "11111111-5eed-4000-8000-000000000002";

const ACCESS: AgentAccess = {
	enforced: false,
	rows: [
		{ kind: "repository", mode: "write_held", scope: ["src/db/**"] },
		{
			kind: "grant",
			skillId: "c83884a9-5eed-4000-8000-000000000121",
			skillSlug: "schema-inspector",
			grant: "db:read",
			system: "db",
			derivedMode: "read",
			mode: "read",
		},
		{ kind: "delivery", mode: "send_after_approval" },
	],
	staleOverrides: [],
};

const onMission = (
	missionId: string,
	entryId: string,
	status: AgentRosterEntry["mission"]["status"] = "draft",
): AgentRosterEntry => ({
	entryId,
	missionId,
	mission: { type: "template-booking", status, sprintN: 2, engagementId: null },
	active: true,
	territory: null,
});

const logged = (
	id: string,
	at: string,
	missionId: string | null,
	entityId: string,
): ActivityEntry => ({
	id,
	at,
	actorKind: "operator",
	actorUserId: "22222222-5eed-4000-8000-000000000001",
	actorRosterEntryId: null,
	action: "roster.entry_updated",
	entityType: "roster_entry",
	entityId,
	missionId,
	engagementId: null,
	requestId: "req",
	payload: {},
	actor: { kind: "operator", display: "javaris" },
});

function render({
	of = atlas,
	tab = "overview",
	entries = [onMission(MISSION, ENTRY)],
	activity = [] as ActivityEntry[],
	nextCursor = null as string | null,
}: {
	of?: AgentTemplate;
	tab?: (typeof AGENT_TABS)[number];
	entries?: AgentRosterEntry[];
	activity?: ActivityEntry[];
	nextCursor?: string | null;
} = {}) {
	const client = seededClient({ agentBySlug: { [of.slug]: of } });
	client.setQueryData(queryKeys.roster.byTemplate(of.id), entries);
	client.setQueryData(queryKeys.catalog.agentAccess(of.id), ACCESS);
	// One read for every entry: the log's rows for all of them at once.
	client.setQueryData(
		queryKeys.activity.entities(
			"roster_entry",
			entries.map((e) => e.entryId),
			AGENT_ACTIVITY_LIMIT,
		),
		{
			pages: [{ data: activity, meta: { nextCursor, total: activity.length } }],
			pageParams: [undefined],
		},
	);
	return inProviders(
		<AgentDetail
			slug={of.slug}
			tab={tab}
			mission={undefined}
			onTab={noop}
			onMission={noop}
		/>,
		client,
		`/catalog/agents/${of.slug}`,
	);
}

describe("an agent's Overview", () => {
	it("1. names the Manifest once, in its panel's title", () => {
		const html = render();
		expect(html.match(/>Manifest</g)).toHaveLength(1);
		expect(tip(<ManifestTab agent={atlas} />)).not.toContain(">Manifest<");
	});

	it("2. says plainly when the generated identity is still a stub", () => {
		expect(isIdentityStub("# Atlas\n")).toBe(true);
		expect(isIdentityStub(atlas.identityMd)).toBe(false);
		const stub = { ...atlas, identityMd: "# Atlas\n" };
		const html = tip(
			<IdentityTab agent={stub} history={sampleHistory(stub)} />,
		);
		expect(element(html, "catalog-agent-identity-stub")).toContain(
			"still a stub",
		);
		// The text still shows, in a box only as wide as it.
		expect(tagOf(html, "catalog-agent-identity-code")).toContain("w-fit");
		expect(
			tip(<IdentityTab agent={atlas} history={sampleHistory(atlas)} />),
		).not.toContain("catalog-agent-identity-stub");
	});

	it("3. lists allowed actions as terms and descriptions, not a table", () => {
		const html = tip(<ManifestTab agent={atlas} />);
		const actions = element(html, "catalog-agent-actions-table");
		expect(actions).toMatch(/^<dl/);
		expect(element(html, "catalog-agent-actions")).not.toContain("<table");
		for (const term of ["Read", "Act", "Propose"])
			expect(actions).toContain(`>${term}</dt>`);
	});

	it("4. says the kind in words beside the machine value", () => {
		expect(KIND_WORDS.horizontal).toMatch(/^Shared/);
		expect(KIND_WORDS.feature).toMatch(/^Feature/);
		const feature = text(
			element(
				tip(<ManifestTab agent={atlas} />),
				"catalog-agent-manifest-text",
			),
		);
		expect(feature).toContain(`kind:feature # ${KIND_WORDS.feature}`);
		const shared = text(
			element(
				tip(<ManifestTab agent={agent("leonora")} />),
				"catalog-agent-manifest-text",
			),
		);
		expect(shared).toContain(`kind:horizontal # ${KIND_WORDS.horizontal}`);
	});
});

describe("the agent banner", () => {
	it("7. links its missions to Missions and its tools to the Tools tab", () => {
		const html = render();
		expect(tagOf(html, "agent-stat-missions-link")).toContain(
			'href="/missions"',
		);
		expect(tagOf(html, "agent-stat-tools-link")).toContain(
			'href="/catalog/agents/atlas?tab=tools"',
		);
		// A link names its number and what it counts.
		expect(element(html, "agent-stat-missions-link")).toContain(
			'<span class="sr-only"> mission</span>',
		);
		// No target, no link.
		expect(html).not.toContain("agent-stat-running-link");
		expect(html).not.toContain("agent-stat-roles-link");
	});

	it("9. shows an icon for the agent's side in its tile, not initials", () => {
		expect(agentIcon(atlas)).toBe(Hammer);
		expect(agentIcon(agent("nemi"))).toBe(FlaskConical);
		expect(agentIcon(agent("brennan"))).toBe(Scale);
		expect(agentIcon(agent("canon"))).toBe(Building2);
		const tile = element(render(), "agent-banner-tile");
		expect(tile).toContain("aria-hidden");
		expect(tile).toContain("<svg");
		expect(text(tile)).toBe("");
	});

	it("10. names the waves, or between missions for a firm agent", () => {
		expect(wavesLabel(atlas)).toBe("wave B");
		expect(wavesLabel({ roles: ["domain"], waveDefaults: ["C", "A"] })).toBe(
			"waves A and C",
		);
		expect(wavesLabel(agent("canon"))).toBe("between missions");
		expect(
			element(render({ of: agent("canon") }), "agent-banner-facts"),
		).toContain(" · between missions · ");
	});

	it("14. pins a compact banner under the top bar, hidden and inert until it scrolls away", () => {
		const html = render();
		const pinned = tagOf(html, "agent-pinned");
		// Sticky at zero height: it takes no room in the page.
		expect(pinned).toContain("sticky");
		expect(pinned).toContain("top-(--topbar-height)");
		expect(pinned).toContain("h-0");
		const bar = element(html, "agent-pinned");
		expect(bar).toMatch(
			/aria-hidden="true"[^>]*inert=""|inert=""[^>]*aria-hidden="true"/,
		);
		// Plain buttons, so each tab id stays one.
		expect(bar).not.toContain('role="tab"');
		for (const id of AGENT_TABS)
			expect(tagOf(html, `agent-pinned-tab-${id}`)).toMatch(/^<button/);
		expect(tagOf(html, "agent-pinned-tab-overview")).toContain(
			'aria-current="true"',
		);
	});

	it("15. announces 1 to 4 on its tabs", () => {
		const html = render();
		AGENT_TABS.forEach((id, i) => {
			expect(tagOf(html, `agent-banner-tab-${id}`)).toContain(
				`aria-keyshortcuts="${i + 1}"`,
			);
		});
	});
});

describe("the page's keys", () => {
	const key = (k: string, mods: Partial<KeyboardEvent> = {}) => ({
		key: k,
		metaKey: false,
		ctrlKey: false,
		altKey: false,
		defaultPrevented: false,
		...mods,
	});
	const body = { tagName: "BODY", isContentEditable: false };

	it("15. opens tabs with 1 to 4 and goes back with Escape", () => {
		expect(agentPageKey(key("1"), body, false)).toBe("overview");
		expect(agentPageKey(key("2"), body, false)).toBe("tools");
		expect(agentPageKey(key("4"), body, false)).toBe("memory");
		expect(agentPageKey(key("5"), body, false)).toBeNull();
		expect(agentPageKey(key("Escape"), body, false)).toBe("back");
	});

	it("15. leaves fields, modified keys and open dialogs alone", () => {
		for (const tagName of ["INPUT", "TEXTAREA", "SELECT"])
			expect(agentPageKey(key("2"), { tagName }, false)).toBeNull();
		expect(
			agentPageKey(
				key("2"),
				{ tagName: "DIV", isContentEditable: true },
				false,
			),
		).toBeNull();
		expect(agentPageKey(key("Escape"), body, true)).toBeNull();
		expect(agentPageKey(key("2", { metaKey: true }), body, false)).toBeNull();
		expect(agentPageKey(key("2", { ctrlKey: true }), body, false)).toBeNull();
		expect(
			agentPageKey(key("2", { defaultPrevented: true }), body, false),
		).toBeNull();
	});
});

describe("Tools and access", () => {
	it("11. locks the rows no switch changes, the reason in a tooltip and for screen readers", () => {
		const html = tip(
			<AccessTable access={ACCESS} readOnly={null} onRowMode={noop} />,
		);
		for (const kind of ["repository", "delivery"] as const) {
			const cell = element(html, `agent-access-fixed-${kind}`);
			expect(cell).toContain('tabindex="0"');
			expect(cell).toContain("<svg");
			expect(cell).toContain(
				`<span class="sr-only">${FIXED_REASON[kind].short}</span>`,
			);
		}
	});
});

describe("Recent activity", () => {
	const rows = [
		logged(
			"a0000000-5eed-4000-8000-000000000003",
			"2026-10-12T10:00:00.000Z",
			OTHER,
			ENTRY2,
		),
		logged(
			"a0000000-5eed-4000-8000-000000000002",
			"2026-10-11T10:00:00.000Z",
			MISSION,
			ENTRY,
		),
		logged(
			"a0000000-5eed-4000-8000-000000000001",
			"2026-10-10T10:00:00.000Z",
			null,
			ENTRY,
		),
	];
	const entries = [
		onMission(MISSION, ENTRY),
		onMission(OTHER, ENTRY2, "active"),
	];

	it("12. groups rows by mission, newest group first, a missing mission from its entry", () => {
		const groups = byMission(rows, entries);
		expect(groups.map((g) => g.missionId)).toEqual([OTHER, MISSION]);
		expect(groups[1]?.rows.map((r) => r.id)).toEqual([
			"a0000000-5eed-4000-8000-000000000002",
			"a0000000-5eed-4000-8000-000000000001",
		]);
		// The row's own mission wins: a mission the agent has left keeps its group.
		const LEFT = "7abc1ce4-5eed-4000-8000-000000000038";
		const gone = logged(
			"a0000000-5eed-4000-8000-000000000004",
			"2026-10-09T10:00:00.000Z",
			LEFT,
			"33333333-5eed-4000-8000-000000000009",
		);
		const left = byMission([...rows, gone], entries).at(-1);
		expect(left?.missionId).toBe(LEFT);
		expect(left?.entry).toBeUndefined();
	});

	it("12. reads every roster entry's rows in one request, and offers more", () => {
		const html = render({ entries, activity: rows, nextCursor: "a2" });
		for (const row of rows) {
			expect(html).toContain(`data-testid="agent-activity-row-${row.id}"`);
		}
		expect(html).toContain('data-testid="agent-activity-load-more"');
		expect(render({ entries, activity: rows })).not.toContain(
			"agent-activity-load-more",
		);
	});

	it("12. heads each group with a link to its mission", () => {
		const html = render({ entries, activity: rows });
		for (const id of [MISSION, OTHER]) {
			const link = tagOf(html, `agent-activity-mission-${id}`);
			expect(link).toContain(`href="/missions/${id}"`);
			expect(element(html, `agent-activity-group-${id}`)).toContain(
				"template-booking, sprint 2",
			);
		}
	});
});

describe("Performance", () => {
	it("13. folds Discipline and Outcome behind Show more, with the count", () => {
		const html = tip(<MeasuresRegion history={sampleHistory(atlas)} />);
		expect(element(html, "catalog-agent-measures-more-toggle")).toContain(
			"Show 2 more sections",
		);
		const rest = element(html, "catalog-agent-measures-more-rest");
		expect(rest).toContain("catalog-agent-discipline");
		expect(rest).toContain("catalog-agent-outcome");
		expect(html).toMatch(
			/inert=""[^>]*>\s*<ul[^>]*data-testid="catalog-agent-measures-more-rest"/,
		);
	});
});
