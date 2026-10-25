/**
 * Sample data for the catalog pages, /catalog/agents and /catalog/skills
 * (AVEL-DESIGN.md rulings 29 and 32). The templates, skills
 * and sources themselves are live: the pages read GET /api/agent-templates,
 * GET /api/skills and GET /api/skill-sources (module 4). What remains here is
 * what no route serves yet: per-agent measures, the per-team table and a
 * source's skill index.
 * Each is keyed off a live record (its slug or id), so a page shows the same
 * samples on every visit; a page that reshuffled on reload would look like
 * live data. Nothing here is sent anywhere, and nothing here is ever written
 * into a real field. Each sample is deleted when its route lands.
 *
 * Per-agent measures and the per-team table have no
 * contract shape yet, so their types are local. The team table follows
 * ROLES.md, but it is server-enforced policy: shown from a client copy it
 * would be a second copy that drifts, so it is a sample like the rest.
 */
import type {
	AgentTemplate,
	Role,
	Skill,
	SkillListItem,
	SkillSource,
	Team,
} from "avel-server/contract";

/**
 * The route each kind of sample stands in for, named in its pill. One list
 * for the three pages, so each sample names its route in one place. None of
 * these has a route in avel-server; each is described in words.
 */
export const CATALOG_MISSING = {
	teams: "the per-team table route",
	/** What a source offers to import. No doc names a route for it yet. */
	registry: "a source's skill index",
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
	// A draft role skill may be attached to roles (PUT /api/skills/:id/roles),
	// but identities are built from approved skills only.
	if (skill.layer === "role") {
		return {
			attachable: false,
			reason:
				"A draft can be attached to roles, but no agent's identity carries it until it is approved.",
		};
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
// Cross-links.

const shares = (a: readonly Role[], b: readonly Role[]) =>
	a.some((role) => b.includes(role));

/**
 * The roles that carry a skill. A role skill is carried by the roles it is
 * attached to (attachedRoles, PUT /api/skills/:id/roles); a stack or domain
 * skill reaches the agents whose roles it is recommended for, at dispatch.
 * The two are different fields on purpose: recommendedFor is never a role
 * skill's attachments.
 */
export function carryingRoles(
	skill: Pick<Skill, "layer" | "recommendedFor" | "attachedRoles">,
): readonly Role[] {
	return skill.layer === "role" ? skill.attachedRoles : skill.recommendedFor;
}

/** The agents, out of the live list, that carry a skill: those covering a role that carries it. */
export function agentsOfSkill<T extends Pick<AgentTemplate, "roles">>(
	skill: Pick<Skill, "layer" | "recommendedFor" | "attachedRoles">,
	agents: readonly T[],
): T[] {
	return agents.filter((agent) => shares(agent.roles, carryingRoles(skill)));
}
