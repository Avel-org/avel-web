/**
 * Sample data for the catalog pages, /catalog/agents and /catalog/skills
 * (AVEL-DESIGN.md rulings 29 and 32). The templates, skills
 * and sources themselves are live: the pages read GET /api/agent-templates,
 * GET /api/skills and GET /api/skill-sources (module 4). What remains here is
 * what no route serves yet: version history, per-agent measures, the
 * per-team table, a source's skill index and a role skill's attachments.
 * Each is keyed off a live record (its slug or id), so a page shows the same
 * samples on every visit; a page that reshuffled on reload would look like
 * live data. Nothing here is sent anywhere, and nothing here is ever written
 * into a real field. Each sample is deleted when its route lands.
 *
 * Version history, per-agent measures and the per-team table have no
 * contract shape yet, so their types are local. The team table follows
 * ROLES.md, but it is server-enforced policy: shown from a client copy it
 * would be a second copy that drifts, so it is a sample like the rest.
 */
import {
	type AgentTemplate,
	ROLE_TEAM,
	ROLES,
	type Role,
	type SkillListItem,
	type SkillSource,
	type Team,
} from "avel-server/contract";

/**
 * The route each kind of sample stands in for, named in its pill. One list
 * for the three pages, so each sample names its route in one place. None of
 * these has a route in avel-server; each is described in words.
 */
export const CATALOG_MISSING = {
	versions: "agent version history",
	measures: "per-agent measures",
	teams: "the per-team table route",
	/** What a source offers to import. No doc names a route for it yet. */
	registry: "a source's skill index",
	/** Which roles a role skill is attached to (role_skills, module 5). */
	roleAttachments: "GET /api/skills/:id/roles (module 5)",
} as const;

export type CatalogMissing =
	(typeof CATALOG_MISSING)[keyof typeof CATALOG_MISSING];

// ---------------------------------------------------------------------------
// Determinism.

/** FNV-1a over the key: a stable, well-spread seed. */
function seedOf(key: string): number {
	let hash = 0x811c9dc5;
	for (let i = 0; i < key.length; i++) {
		hash ^= key.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193);
	}
	return hash >>> 0;
}

/** A deterministic sequence of numbers in [0, 1) from the key. */
function sequence(key: string): () => number {
	let state = seedOf(key) || 1;
	return () => {
		// xorshift32
		state ^= state << 13;
		state ^= state >>> 17;
		state ^= state << 5;
		return (state >>> 0) / 0x1_0000_0000;
	};
}

const between = (next: () => number, low: number, high: number): number =>
	low + Math.floor(next() * (high - low + 1));

/** A SHA-256-shaped value (64 hex characters) from the key. Not a real hash. */
export function sampleSha256(key: string): string {
	const next = sequence(`${key}:sha`);
	let hex = "";
	while (hex.length < 64) {
		hex += Math.floor(next() * 0x1_0000_0000)
			.toString(16)
			.padStart(8, "0");
	}
	return hex.slice(0, 64);
}

/** A version 4 UUID from the key, so sample ids pass the contract's uuid(). */
export function sampleUuid(key: string): string {
	const hex = sampleSha256(`${key}:uuid`);
	return [
		hex.slice(0, 8),
		hex.slice(8, 12),
		`4${hex.slice(13, 16)}`,
		`8${hex.slice(17, 20)}`,
		hex.slice(20, 32),
	].join("-");
}

/** A fixed instant in 2026, as the contract's ISO datetime. */
const isoDay = (month: number, day: number) =>
	`2026-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T12:00:00.000Z`;

// ---------------------------------------------------------------------------
// Teams (ROLES.md's families). Each role's team and its label are the
// contract's (ROLE_TEAM, TEAM_LABELS); only the table below is a sample.

export type SampleTeamRow = {
	team: Exclude<Team, "platform">;
	read: string;
	act: string;
	propose: string;
};

/**
 * What each team may do through the API: read, act, propose. Platform has
 * no row: its roles are code, with no agent and no token.
 */
export const SAMPLE_TEAM_TABLE: readonly SampleTeamRow[] = [
	{
		team: "foundation",
		read: "Its own dispatch: brief, identity, conventions, boundaries",
		act: "Its own completion report",
		propose: "Nothing",
	},
	{
		team: "build",
		read: "Its own dispatch",
		act: "Its own completion report",
		propose: "Nothing",
	},
	{
		team: "verify",
		read: "Its own dispatch",
		act: "Its own completion report",
		propose: "Nothing",
	},
	{
		team: "review",
		read: "Its own dispatch",
		act: "Its own completion report, and an open finding on its own mission",
		propose: "Nothing",
	},
	{
		team: "operate",
		read: "The delivered mission: exports, findings, activity",
		act: "Its own completion report",
		propose: "A follow-up",
	},
	{
		team: "firm",
		read: "Across missions: clients, missions, engagements, exports, activity. Never connections, repo policies or credentials",
		act: "intake only: intake drafts",
		propose:
			"intake: questions. strategy: chat suggestions and next missions. client-ops: a client message",
	},
];

// ---------------------------------------------------------------------------
// Skills: rules on the live list.

/**
 * Imported drafts: what a source sent that no one has reviewed. The Skills
 * banner counts these, and each is approved before it can be attached.
 */
export function skillsNeedingReview(skills: readonly SkillListItem[]) {
	return skills.filter(
		(skill) => skill.status === "draft" && skill.source.kind !== "internal",
	);
}

/** Imported means it came from outside AVEL: a vendor or community source. */
export function isImported(skill: SkillListItem): boolean {
	return skill.source.kind !== "internal";
}

/**
 * Whether a skill can be attached, and if not, why. Only approved skills can
 * be attached; an imported skill starts as a draft and is reviewed first.
 */
export function attachability(
	skill: SkillListItem,
): { attachable: true } | { attachable: false; reason: string } {
	if (skill.status === "approved") return { attachable: true };
	if (skill.status === "retired") {
		return { attachable: false, reason: "Retired skills can't be attached." };
	}
	return {
		attachable: false,
		reason: isImported(skill)
			? "An imported draft can't be attached until it is reviewed and approved."
			: "A draft can't be attached until it is approved.",
	};
}

/**
 * Whether any sandbox room enforces capabilities yet. None does: module 7,
 * the rooms, is unbuilt (STATE.md). The server will say this, not the page.
 */
export const SAMPLE_ROOMS_ENFORCING = false;

/**
 * The enforcement a skill's badge may claim. A badge never claims more than
 * the running system provides: knowledge is advice, and a capability is
 * enforced only where a room enforces it.
 */
export function enforcementBadge(
	type: SkillListItem["type"],
	roomsEnforcing: boolean,
): { label: string; enforced: boolean } {
	if (type === "knowledge") {
		return { label: "Advice, nothing to enforce", enforced: false };
	}
	return roomsEnforcing
		? { label: "Enforced by the room", enforced: true }
		: { label: "Not enforced: no room is running", enforced: false };
}

// ---------------------------------------------------------------------------
// A source's skill index (Discover). No route lists what a source offers, so
// each vendor or community source shows a fixed set of entries, keyed off its
// live id.

/** One skill a vendor or community source offers, not yet imported. */
export type SampleRegistryEntry = {
	id: string;
	name: string;
	/** Where it lives in its source, such as a repository path. */
	path: string;
	description: string;
	sourceId: string;
	contentSha256: string;
};

type RegistrySeed = Pick<SampleRegistryEntry, "name" | "description">;

const REGISTRY_SEEDS: readonly RegistrySeed[] = [
	{
		name: "tanstack-query-keys",
		description:
			"Use when adding a query: one key factory, never an inline key.",
	},
	{
		name: "tailwind-tokens-only",
		description: "Use when styling: tokens and utilities, no raw colours.",
	},
	{
		name: "playwright-by-role",
		description:
			"Use when writing a browser test: find elements by role and label.",
	},
	{
		name: "zod-at-the-edge",
		description:
			"Use when data crosses a boundary: parse it with a schema first.",
	},
	{
		name: "conventional-commits",
		description:
			"Use when writing a commit message: type(scope), imperative, under 72.",
	},
];

/**
 * What each vendor and community source offers, two or three entries each,
 * fixed by the source's id. An internal source offers nothing: AVEL's own
 * skills are already in the library.
 */
export function sampleRegistry(
	sources: readonly SkillSource[],
): SampleRegistryEntry[] {
	return sources
		.filter((source) => source.kind !== "internal")
		.flatMap((source) => {
			const next = sequence(`registry:${source.id}`);
			const first = between(next, 0, REGISTRY_SEEDS.length - 1);
			const count = between(next, 2, 3);
			return Array.from({ length: count }, (_, i) => {
				const seed = REGISTRY_SEEDS[(first + i) % REGISTRY_SEEDS.length];
				const path = `${source.kind}/skills/${seed?.name ?? ""}`;
				const key = `registry:${source.id}:${path}`;
				return {
					id: sampleUuid(key),
					name: seed?.name ?? "",
					path,
					description: seed?.description ?? "",
					sourceId: source.id,
					contentSha256: sampleSha256(key),
				};
			});
		});
}

// ---------------------------------------------------------------------------
// Per-agent history and measures: no contract shape yet, so local types.

export type SampleOrigin = "client" | "internal";

export type SampleVersion = {
	version: number;
	sha256: string;
	createdAt: string;
	/** The role change the version was generated from. */
	change: string;
};

export type SampleDiscipline = {
	origin: SampleOrigin;
	runs: number;
	boundaryViolations: number;
	blockersFiled: number;
	blockersAbsorbed: number;
	edgeHashMismatches: number;
	testWritesCaught: number;
};

/** One comparison group: one territory on one mission template, one origin. */
export type SampleOutcome = {
	id: string;
	origin: SampleOrigin;
	territory: string | null;
	missionTemplate: string;
	engagement: string;
	runs: number;
	tokensPerRun: number;
	costPerRunUsd: number;
	firstPassGateRate: number;
};

/** A run whose version was backfilled: findings only, no comparisons. */
export type SampleReconstructedRun = {
	id: string;
	mission: string;
	commit: string;
	findings: string;
};

export type SampleAgentHistory = {
	/** Newest first. The first entry is the template's current version. */
	versions: SampleVersion[];
	discipline: SampleDiscipline[];
	outcomes: SampleOutcome[];
	reconstructed: SampleReconstructedRun[];
};

/**
 * The cap the generator holds identity.md and depth.md to, each (migration
 * 0024). It moves to the contract once avel-server exports it.
 */
export const IDENTITY_TOKEN_CAP = 1200;

const MISSION_TEMPLATES = ["template-booking", "template-fullstack"] as const;
const ENGAGEMENTS = {
	client: ["Meridian booking", "Harbor clinic"],
	internal: ["AVEL itself"],
} as const;

/** The territories a roster could place a feature agent in. */
const TERRITORIES = ["scheduling", "billing", "booking", "catalog"] as const;

/**
 * A template has no territories of its own: a territory is where a roster
 * places a feature agent. Until the roster serves them, a feature agent gets
 * one or two, fixed by its slug; a horizontal agent works the whole project
 * and gets none. `null` is the whole project, as the outcome rows spell it.
 */
function sampleTerritories(
	agent: Pick<AgentTemplate, "slug" | "kind">,
): (string | null)[] {
	if (agent.kind !== "feature") return [null];
	const next = sequence(`agent:${agent.slug}:territories`);
	const first = between(next, 0, TERRITORIES.length - 1);
	const count = between(next, 1, 2);
	return Array.from(
		{ length: count },
		(_, i) => TERRITORIES[(first + i) % TERRITORIES.length] ?? null,
	);
}

function versionsOf(agent: AgentTemplate): SampleVersion[] {
	const next = sequence(`agent:${agent.slug}:history`);
	return Array.from({ length: agent.version }, (_, i) => {
		const version = agent.version - i;
		const role = agent.roles[Math.floor(next() * agent.roles.length)];
		return {
			version,
			sha256: sampleSha256(`agent:${agent.slug}:v${version}`),
			createdAt: isoDay(Math.max(1, 10 - i), between(next, 1, 28)),
			change:
				version === 1
					? "First generation"
					: `The ${role ?? "role"} definition changed`,
		};
	});
}

function disciplineOf(slug: string): SampleDiscipline[] {
	return (["client", "internal"] as const).map((origin) => {
		const next = sequence(`agent:${slug}:discipline:${origin}`);
		return {
			origin,
			runs: between(next, 2, 14),
			boundaryViolations: between(next, 0, 2),
			blockersFiled: between(next, 0, 6),
			blockersAbsorbed: between(next, 0, 1),
			edgeHashMismatches: between(next, 0, 1),
			testWritesCaught: between(next, 0, 1),
		};
	});
}

function outcomesOf(agent: Pick<AgentTemplate, "slug" | "kind">) {
	const rows: SampleOutcome[] = [];
	for (const origin of ["client", "internal"] as const) {
		for (const territory of sampleTerritories(agent)) {
			const id = `${agent.slug}:${origin}:${territory ?? "whole"}`;
			const next = sequence(`agent:${id}`);
			const tokensPerRun = between(next, 18, 140) * 1000;
			rows.push({
				id,
				origin,
				territory,
				missionTemplate:
					MISSION_TEMPLATES[Math.floor(next() * MISSION_TEMPLATES.length)] ??
					"template-booking",
				engagement:
					ENGAGEMENTS[origin][
						Math.floor(next() * ENGAGEMENTS[origin].length)
					] ?? "",
				runs: between(next, 1, 9),
				tokensPerRun,
				// About $6 per million tokens, blended, rounded to the cent.
				costPerRunUsd: Math.round(tokensPerRun * 0.0006) / 100,
				firstPassGateRate: between(next, 40, 95) / 100,
			});
		}
	}
	return rows;
}

/** One template's sample history and measures, fixed by its slug. */
export function sampleHistory(agent: AgentTemplate): SampleAgentHistory {
	const next = sequence(`agent:${agent.slug}:tokens`);
	// About half the templates have a run whose version was backfilled.
	const reconstructed = next() < 0.5;
	return {
		versions: versionsOf(agent),
		discipline: disciplineOf(agent.slug),
		outcomes: outcomesOf(agent),
		reconstructed: reconstructed
			? [
					{
						id: `${agent.slug}:mission-002`,
						mission: "mission-002",
						commit: "31f4b44",
						findings: `${between(next, 0, 3)} blockers filed, none absorbed; no boundary violations`,
					},
				]
			: [],
	};
}

// ---------------------------------------------------------------------------
// Cross-links.

const shares = (a: readonly Role[], b: readonly Role[]) =>
	a.some((role) => b.includes(role));

/**
 * The roles each role-layer skill is attached to: the role_skills join
 * table, which module 5 writes and no route reads yet (SKILLS.md, Three
 * layers). This is not recommendedFor. recommendedFor is the dispatch filter
 * for stack and domain skills; for a role skill the two can differ, and here
 * they do, on purpose, so nothing can quietly read one as the other. A role
 * skill not named here gets attachments fixed by its slug (sampleRoleAttachments).
 */
export const SAMPLE_ROLE_ATTACHMENTS: Readonly<
	Record<string, readonly Role[]>
> = {
	"property-testing-fast-check": ["property-tests", "backend-tests"],
	"agreeing-wrong-tests": ["spec-judgment", "security-review"],
	"criterion-tags": ["backend-tests", "frontend-tests"],
	"middleware-not-enough": ["security-review"],
};

/** The roles an agent can hold: everything but Platform, whose roles are code. */
const ATTACHABLE_ROLES: readonly Role[] = ROLES.filter(
	(role) => ROLE_TEAM[role] !== "platform",
);

/**
 * A role skill's sample attachments: the fixed set when its slug is named,
 * otherwise one or two roles fixed by the slug, so a live skill shows the
 * same switches on every visit.
 */
export function sampleRoleAttachments(slug: string): readonly Role[] {
	const named = SAMPLE_ROLE_ATTACHMENTS[slug];
	if (named) return named;
	const next = sequence(`attachments:${slug}`);
	const first = between(next, 0, ATTACHABLE_ROLES.length - 1);
	const count = between(next, 1, 2);
	return Array.from(
		{ length: count },
		(_, i) => ATTACHABLE_ROLES[(first + i) % ATTACHABLE_ROLES.length],
	).filter((role): role is Role => role !== undefined);
}

/**
 * The roles that carry a skill. A role skill is carried by the roles it is
 * attached to (role_skills, a sample until module 5's read exists); a stack
 * or domain skill reaches the agents whose roles it is recommended for, at
 * dispatch, which is live.
 */
export function carryingRoles(
	skill: Pick<SkillListItem, "slug" | "layer" | "recommendedFor">,
): readonly Role[] {
	return skill.layer === "role"
		? sampleRoleAttachments(skill.slug)
		: skill.recommendedFor;
}

/**
 * The skills an agent carries, through its roles, out of the live list. Role
 * skills are part of its identity, through the roles they are attached to;
 * stack and domain skills arrive at dispatch, to agents whose roles they are
 * recommended for.
 */
export function skillsOfAgent<T extends SkillListItem>(
	agent: Pick<AgentTemplate, "roles">,
	skills: readonly T[],
): { role: T[]; dispatch: T[] } {
	const carried = skills.filter((skill) =>
		shares(carryingRoles(skill), agent.roles),
	);
	return {
		role: carried.filter((skill) => skill.layer === "role"),
		dispatch: carried.filter((skill) => skill.layer !== "role"),
	};
}

/** The agents, out of the live list, that carry a skill: those covering a role that carries it. */
export function agentsOfSkill<T extends Pick<AgentTemplate, "roles">>(
	skill: Pick<SkillListItem, "slug" | "layer" | "recommendedFor">,
	agents: readonly T[],
): T[] {
	return agents.filter((agent) => shares(agent.roles, carryingRoles(skill)));
}
