/**
 * Sample data for the catalog pages, /catalog/agents, /catalog/skills and
 * /catalog/sources (AVEL-DESIGN.md rulings 29 and 32). avel-server serves the
 * catalog reads, but these pages are not wired to them yet (the seed has no
 * skills or sources to show), so every value here is invented. Templates,
 * skills and sources are typed by the contract; each is replaced by real
 * data, and deleted, when its page is wired. Nothing here is sent anywhere,
 * and nothing here is ever written into a real field.
 *
 * Version history, per-agent measures and the per-family table have no
 * contract shape yet, so their types are local. The family table follows
 * ROLES.md, but it is server-enforced policy: shown from a client copy it
 * would be a second copy that drifts, so it is a sample like the rest.
 *
 * Values derive from fixed keys, so a page shows the same samples on every
 * visit: a page that reshuffled on reload would look like live data.
 */
import type {
	AgentTemplate,
	Role,
	Skill,
	SkillListItem,
	SkillSource,
} from "avel-server/contract";

/**
 * The route each kind of sample stands in for, named in its pill. One list
 * for the three pages, so each sample names its route in one place. Routes
 * with no contract shape yet are described in words.
 */
export const CATALOG_MISSING = {
	templates: "GET /api/agent-templates",
	versions: "agent version history",
	measures: "per-agent measures",
	families: "the per-family table route",
	skills: "GET /api/skills",
	/** One skill with its text: SKILL.md and AVEL's additions. */
	skill: "GET /api/skills/by-slug/:slug",
	sources: "GET /api/skill-sources",
	/** What a source offers to import. No doc names a route for it yet. */
	registry: "a source's skill index",
} as const;

export type CatalogMissing =
	(typeof CATALOG_MISSING)[keyof typeof CATALOG_MISSING];

/**
 * The routes avel-server already serves (the catalog reads, d4deabb), which
 * these pages are not wired to yet. Their pills say so, rather than claim
 * the server lacks them. The rest of CATALOG_MISSING has no route at all.
 */
const SERVED: ReadonlySet<string> = new Set([
	CATALOG_MISSING.templates,
	CATALOG_MISSING.skills,
	CATALOG_MISSING.skill,
	CATALOG_MISSING.sources,
]);

/** The pill's words for a catalog region: undefined keeps SampleData's own. */
export function catalogPillReason(missing: string): string | undefined {
	return SERVED.has(missing)
		? `Sample data. avel-server serves ${missing}; this page is wired to it in a later step.`
		: undefined;
}

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
// Roles and families (ROLES.md, as samples).

export type SampleFamily =
	| "Foundation"
	| "Build"
	| "Verify"
	| "Review"
	| "Operate"
	| "Firm"
	| "Platform";

/**
 * Each role's family. Keyed on the contract's Role union with `satisfies`,
 * so a role the server adds or removes fails this build until it is placed.
 */
export const SAMPLE_ROLE_FAMILY = {
	foundations: "Foundation",
	schema: "Foundation",
	contract: "Foundation",
	"design-system": "Foundation",
	fixture: "Foundation",
	domain: "Build",
	"api-surface": "Build",
	integration: "Build",
	realtime: "Build",
	auth: "Build",
	state: "Build",
	interface: "Build",
	"backend-tests": "Verify",
	"frontend-tests": "Verify",
	"property-tests": "Verify",
	accessibility: "Verify",
	performance: "Verify",
	"spec-check": "Review",
	"spec-judgment": "Review",
	"security-review": "Review",
	"compliance-review": "Review",
	adversarial: "Review",
	reconciliation: "Review",
	concurrency: "Review",
	deploy: "Operate",
	recovery: "Operate",
	observability: "Operate",
	"incident-response": "Operate",
	intake: "Firm",
	strategy: "Firm",
	research: "Firm",
	"client-ops": "Firm",
	knowledge: "Platform",
	render: "Platform",
	"ship-decision": "Platform",
} as const satisfies Record<Role, SampleFamily>;

export type SampleFamilyRow = {
	family: Exclude<SampleFamily, "Platform">;
	read: string;
	act: string;
	propose: string;
};

/**
 * What each family may do through the API: read, act, propose. Platform has
 * no row: its roles are code, with no agent and no token.
 */
export const SAMPLE_FAMILY_TABLE: readonly SampleFamilyRow[] = [
	{
		family: "Foundation",
		read: "Its own dispatch: brief, identity, conventions, boundaries",
		act: "Its own completion report",
		propose: "Nothing",
	},
	{
		family: "Build",
		read: "Its own dispatch",
		act: "Its own completion report",
		propose: "Nothing",
	},
	{
		family: "Verify",
		read: "Its own dispatch",
		act: "Its own completion report",
		propose: "Nothing",
	},
	{
		family: "Review",
		read: "Its own dispatch",
		act: "Its own completion report, and an open finding on its own mission",
		propose: "Nothing",
	},
	{
		family: "Operate",
		read: "The delivered mission: exports, findings, activity",
		act: "Its own completion report",
		propose: "A follow-up",
	},
	{
		family: "Firm",
		read: "Across missions: clients, missions, engagements, exports, activity. Never connections, repo policies or credentials",
		act: "intake only: intake drafts",
		propose:
			"intake: questions. strategy: chat suggestions and next missions. client-ops: a client message",
	},
];

/** The families an agent's roles fall in, in table order. */
export function familiesOf(roles: readonly Role[]): SampleFamily[] {
	const covered = new Set<SampleFamily>(
		roles.map((role) => SAMPLE_ROLE_FAMILY[role]),
	);
	return SAMPLE_FAMILY_TABLE.map((row) => row.family).filter((family) =>
		covered.has(family),
	);
}

// ---------------------------------------------------------------------------
// Skill sources.

type SourceSeed = Pick<SkillSource, "name" | "kind" | "url" | "license"> & {
	key: string;
};

const SOURCE_SEEDS: readonly SourceSeed[] = [
	{ key: "src-avel", name: "AVEL", kind: "internal", url: null, license: null },
	{
		key: "src-vendor-pack",
		name: "Framework vendor pack",
		kind: "vendor",
		url: "https://example.com/vendor/skills",
		license: "Apache-2.0",
	},
	{
		key: "src-community-index",
		name: "Community skills index",
		kind: "community",
		url: "https://example.org/skills-index",
		license: "MIT",
	},
];

const sourceIdOf = (key: string) => sampleUuid(`source:${key}`);

// ---------------------------------------------------------------------------
// Skills.

type SkillSeed = Pick<
	SkillListItem,
	"slug" | "name" | "description" | "layer" | "recommendedFor" | "status"
> &
	(
		| { type: "knowledge"; grants: null; ioShape: null }
		| {
				type: "capability";
				grants: string[];
				ioShape: { reads: "large" | "small"; returns: "large" | "small" };
		  }
	) & {
		/** The key of its source in SOURCE_SEEDS. */
		sourceId: string;
		/** The full skill, loaded only when the task needs it. */
		contentMd: string;
		/** AVEL's additions to an imported skill, kept apart from the original. */
		avelEnhancementMd?: string;
	};

const SKILL_SEEDS: readonly SkillSeed[] = [
	{
		slug: "property-testing-fast-check",
		name: "Property testing with fast-check",
		description:
			"Use when a function has an invariant the spec states, such as a round trip or an ordering. Write the invariant as a fast-check property before any example.",
		layer: "role",
		type: "knowledge",
		grants: null,
		ioShape: null,
		recommendedFor: ["property-tests"],
		sourceId: "src-avel",
		status: "approved",
		contentMd:
			"# Property testing with fast-check\n\n1. State the invariant from the spec in one sentence.\n2. Write it as `fc.assert(fc.property(...))` before any example test.\n3. Shrink a failure to its smallest case, then add that case as an example.",
	},
	{
		slug: "agreeing-wrong-tests",
		name: "Code and tests that agree and are both wrong",
		description:
			"Use when judging an implementation whose tests pass. Read the brief first, then check each assertion against the brief rather than against the code.",
		layer: "role",
		type: "knowledge",
		grants: null,
		ioShape: null,
		recommendedFor: ["spec-judgment"],
		sourceId: "src-avel",
		status: "approved",
		contentMd:
			"# Code and tests that agree and are both wrong\n\n- Read the brief before the code.\n- For each assertion, find the sentence in the brief it checks.\n- An assertion with no sentence behind it is a finding.",
	},
	{
		slug: "criterion-tags",
		name: "Tagging every test with its acceptance criterion",
		description:
			"Use when writing any test. Tag it with the acceptance criterion it covers, so spec-check can find criteria with no test.",
		layer: "role",
		type: "knowledge",
		grants: null,
		ioShape: null,
		recommendedFor: ["backend-tests", "frontend-tests", "property-tests"],
		sourceId: "src-avel",
		status: "approved",
		contentMd:
			"# Tagging every test with its acceptance criterion\n\n- Name the criterion in the test title: `AC-3: rejects a past date`.\n- One criterion per test.\n- spec-check lists every criterion with no tagged test.",
	},
	{
		slug: "middleware-not-enough",
		name: "Where admin routes are really protected",
		description:
			"Use when reviewing authorization. Middleware alone does not protect an admin route; check that every handler checks the caller.",
		layer: "role",
		type: "knowledge",
		grants: null,
		ioShape: null,
		recommendedFor: ["security-review"],
		sourceId: "src-avel",
		status: "approved",
		contentMd:
			"# Where admin routes are really protected\n\n- Middleware can be skipped by a route that is not matched.\n- Open each admin handler and find the caller check inside it.\n- A handler with no check is a finding, whatever the middleware does.",
	},
	{
		slug: "nextjs-route-handlers",
		name: "Next.js route groups and route handlers",
		description:
			"Use when adding a page or an API route to a Next.js app router project.",
		layer: "stack",
		type: "knowledge",
		grants: null,
		ioShape: null,
		recommendedFor: ["api-surface", "interface"],
		sourceId: "src-vendor-pack",
		status: "approved",
		contentMd:
			"# Next.js route groups and route handlers\n\n- Group routes with `(folder)`; the folder never reaches the URL.\n- A route handler is `route.ts` exporting `GET`, `POST` and so on.\n- Never put a page and a route handler in the same segment.",
		avelEnhancementMd:
			"## AVEL's additions\n\n- Every handler parses its body with the contract's schema before using it.",
	},
	{
		slug: "drizzle-migrations",
		name: "Drizzle schemas and generated migrations",
		description:
			"Use when changing a table. Edit the Drizzle schema, generate the migration, and never hand-edit generated SQL.",
		layer: "stack",
		type: "knowledge",
		grants: null,
		ioShape: null,
		recommendedFor: ["schema"],
		sourceId: "src-avel",
		status: "approved",
		contentMd:
			"# Drizzle schemas and generated migrations\n\n1. Change the schema in `src/db/schema`.\n2. Run `drizzle-kit generate`.\n3. Commit the schema and the generated SQL together; never edit the SQL.",
	},
	{
		slug: "better-auth-allow-list",
		name: "Better Auth with an allow-list",
		description:
			"Use when sign-in must be limited to known accounts. Check the allow-list in the sign-in callback, not after the session exists.",
		layer: "stack",
		type: "knowledge",
		grants: null,
		ioShape: null,
		recommendedFor: ["auth", "security-review"],
		sourceId: "src-community-index",
		status: "draft",
		contentMd:
			"# Better Auth with an allow-list\n\n- Read the allow-list in the sign-in callback.\n- Refuse before a session is created, not after.\n- Log the refused email's domain, never the address.",
		avelEnhancementMd:
			"## AVEL's additions\n\n- The allow-list lives in an environment variable, one GitHub login per line.",
	},
	{
		slug: "luxon-daylight-saving",
		name: "Luxon and daylight saving",
		description:
			"Use when a feature schedules by local time. A skipped daylight-saving hour must never be offered, and a repeated one must be offered once.",
		layer: "stack",
		type: "knowledge",
		grants: null,
		ioShape: null,
		recommendedFor: ["domain", "property-tests"],
		sourceId: "src-avel",
		status: "approved",
		contentMd:
			"# Luxon and daylight saving\n\n- Build slots in the venue's zone with `DateTime.fromObject({...}, { zone })`.\n- Skip a slot whose local time does not exist.\n- Offer a repeated hour once.",
	},
	{
		slug: "booking-vocabulary",
		name: "Booking vocabulary",
		description:
			"Use when a brief or a screen talks about appointments, services or slots. Timed and day-based services follow different rules.",
		layer: "domain",
		type: "knowledge",
		grants: null,
		ioShape: null,
		recommendedFor: ["domain", "intake"],
		sourceId: "src-avel",
		status: "approved",
		contentMd:
			"# Booking vocabulary\n\n- A service is timed (30 minutes) or day-based (a night's stay).\n- A slot is a start time a timed service can begin at.\n- A booking holds one slot for one service.",
	},
	{
		slug: "headless-browser",
		name: "Headless browser",
		description:
			"Use when a test must drive the built interface in a real browser.",
		layer: "stack",
		type: "capability",
		grants: ["A headless browser"],
		ioShape: { reads: "large", returns: "small" },
		recommendedFor: ["frontend-tests"],
		sourceId: "src-vendor-pack",
		status: "approved",
		contentMd:
			"# Headless browser\n\n- Start the browser once per test file.\n- Drive the page by role and label, never by CSS class.\n- Return a verdict and a screenshot path, not the page's markup.",
		avelEnhancementMd:
			"## AVEL's additions\n\n- Screenshots are written under the room's scratch directory only.",
	},
	{
		slug: "database-read",
		name: "Read access to the database",
		description:
			"Use when a test or a judgment needs the rows a migration produced.",
		layer: "stack",
		type: "capability",
		grants: ["Read access to the database"],
		ioShape: { reads: "large", returns: "small" },
		recommendedFor: ["backend-tests", "spec-judgment"],
		sourceId: "src-community-index",
		status: "draft",
		contentMd:
			"# Read access to the database\n\n- Connect with the read-only role the room provides.\n- Select only the columns the check needs.\n- Return counts and row ids, never whole rows.",
		avelEnhancementMd:
			"## AVEL's additions\n\n- The connection string comes from the room; never ask for one.",
	},
	{
		slug: "package-registry",
		name: "The package registry",
		description: "Use when a build step must install a dependency.",
		layer: "stack",
		type: "capability",
		grants: ["The package registry"],
		ioShape: { reads: "small", returns: "small" },
		recommendedFor: ["domain", "interface"],
		sourceId: "src-avel",
		status: "retired",
		contentMd:
			"# The package registry\n\n- Install only what the lockfile names.\n- Never add a dependency without a blocker explaining why.",
	},
];

/**
 * Each skill as get returns it: the list item plus its text. A list shows
 * only the SkillListItem fields; the inspector shows the rest.
 */
export const SAMPLE_SKILLS: readonly Skill[] = SKILL_SEEDS.map(
	({ sourceId, avelEnhancementMd, ...seed }): Skill => {
		const key = `skill:${seed.slug}`;
		const next = sequence(key);
		const source = SOURCE_SEEDS.find((s) => s.key === sourceId);
		const reviewed = seed.status !== "draft";
		const month = between(next, 7, 9);
		return {
			...seed,
			id: sampleUuid(key),
			source: {
				id: sourceIdOf(sourceId),
				name: source?.name ?? "",
				kind: source?.kind ?? "internal",
			},
			contentSha256: sampleSha256(key),
			reviewedBy: reviewed ? sampleUuid(`reviewer:${month}`) : null,
			reviewedAt: reviewed ? isoDay(month, between(next, 10, 28)) : null,
			version: between(next, 1, 4),
			createdAt: isoDay(month, 1),
			updatedAt: isoDay(month, 9),
			avelEnhancementMd: avelEnhancementMd ?? null,
		} as Skill;
	},
);

export function sampleSkill(slug: string): Skill | undefined {
	return SAMPLE_SKILLS.find((skill) => skill.slug === slug);
}

export const SAMPLE_SOURCES: readonly SkillSource[] = SOURCE_SEEDS.map(
	({ key, ...seed }) => ({
		...seed,
		id: sourceIdOf(key),
		// Counted from the samples, so the two pages agree.
		skillCount: SAMPLE_SKILLS.filter(
			(skill) => skill.source.id === sourceIdOf(key),
		).length,
		createdAt: isoDay(6, 1),
		updatedAt: isoDay(6, 1),
	}),
);

/**
 * Imported drafts: what a source sent that no one has reviewed. The Skills
 * banner counts these, and each is approved before it can be attached.
 */
export function skillsNeedingReview(skills: readonly SkillListItem[]) {
	return skills.filter(
		(skill) => skill.status === "draft" && skill.source.kind !== "internal",
	);
}

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

type RegistrySeed = Omit<
	SampleRegistryEntry,
	"id" | "sourceId" | "contentSha256"
> & {
	source: string;
};

const REGISTRY_SEEDS: readonly RegistrySeed[] = [
	{
		name: "tanstack-query-keys",
		path: "vendor/skills/tanstack-query-keys",
		description:
			"Use when adding a query: one key factory, never an inline key.",
		source: "src-vendor-pack",
	},
	{
		name: "tailwind-tokens-only",
		path: "vendor/skills/tailwind-tokens-only",
		description: "Use when styling: tokens and utilities, no raw colours.",
		source: "src-vendor-pack",
	},
	{
		name: "playwright-by-role",
		path: "vendor/skills/playwright-by-role",
		description:
			"Use when writing a browser test: find elements by role and label.",
		source: "src-vendor-pack",
	},
	{
		name: "zod-at-the-edge",
		path: "skills-index/zod-at-the-edge",
		description:
			"Use when data crosses a boundary: parse it with a schema first.",
		source: "src-community-index",
	},
	{
		name: "conventional-commits",
		path: "skills-index/conventional-commits",
		description:
			"Use when writing a commit message: type(scope), imperative, under 72.",
		source: "src-community-index",
	},
];

/** What each source offers, ranked by source then name: there is no install count. */
export const SAMPLE_REGISTRY: readonly SampleRegistryEntry[] =
	REGISTRY_SEEDS.map(({ source, ...seed }) => ({
		...seed,
		id: sampleUuid(`registry:${seed.path}`),
		sourceId: sourceIdOf(source),
		contentSha256: sampleSha256(`registry:${seed.path}`),
	}));

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
// Agent templates.

type AgentSeed = Pick<
	AgentTemplate,
	"slug" | "name" | "kind" | "roles" | "waveDefaults" | "writablePaths"
> & {
	territories: (string | null)[];
	reconstructed: boolean;
};

const AGENT_SEEDS: readonly AgentSeed[] = [
	{
		slug: "atlas",
		name: "Atlas",
		kind: "feature",
		// Out of catalog order on purpose: the page sorts by ROLES, not by the data.
		roles: ["api-surface", "domain"],
		waveDefaults: ["B"],
		writablePaths: ["src/server/**", "!**/*.test.ts"],
		territories: ["scheduling", "billing"],
		reconstructed: true,
	},
	{
		slug: "leonora",
		name: "Leonora",
		kind: "horizontal",
		roles: ["schema", "contract"],
		waveDefaults: ["A"],
		writablePaths: ["src/db/**", "src/contract/**", "!**/*.test.ts"],
		territories: [null],
		reconstructed: true,
	},
	{
		slug: "leon",
		name: "Leon",
		kind: "feature",
		roles: ["interface", "state"],
		waveDefaults: ["B"],
		writablePaths: ["src/app/**", "!**/*.test.ts"],
		territories: ["booking", null],
		reconstructed: false,
	},
	{
		slug: "nemi",
		name: "Nemi",
		kind: "horizontal",
		roles: ["frontend-tests"],
		waveDefaults: ["C"],
		writablePaths: ["tests/e2e/**", "**/*.test.tsx"],
		territories: [null],
		reconstructed: false,
	},
	{
		slug: "iyo",
		name: "Iyo",
		kind: "horizontal",
		roles: ["backend-tests", "property-tests"],
		waveDefaults: ["C"],
		writablePaths: ["tests/**", "**/*.test.ts"],
		territories: [null],
		reconstructed: false,
	},
	{
		slug: "brennan",
		name: "Brennan",
		kind: "horizontal",
		roles: ["spec-judgment"],
		waveDefaults: ["D"],
		writablePaths: ["findings/spec-judgment/**"],
		territories: [null],
		reconstructed: true,
	},
	{
		slug: "zane",
		name: "Zane",
		kind: "horizontal",
		roles: ["security-review", "compliance-review"],
		waveDefaults: ["D"],
		writablePaths: [
			"findings/security-review/**",
			"findings/compliance-review/**",
		],
		territories: [null],
		reconstructed: false,
	},
	{
		slug: "canon",
		name: "Canon",
		kind: "horizontal",
		roles: ["intake", "strategy"],
		waveDefaults: ["A"],
		writablePaths: [],
		territories: [null],
		reconstructed: false,
	},
];

function identityText(seed: AgentSeed): string {
	return [
		`# ${seed.name}`,
		"",
		`Generated from ${seed.roles.length === 1 ? "one role" : `${seed.roles.length} roles`}. Do not edit by hand.`,
		"",
		"## Roles",
		...seed.roles.map(
			(role) => `- ${role} (${SAMPLE_ROLE_FAMILY[role].toLowerCase()})`,
		),
		"",
		"## Boundaries",
		"- Write only inside the mount for these roles.",
		"- Record the hash of every artifact you read.",
		"- File a blocker rather than absorbing a provisioning gap.",
	].join("\n");
}

/** How many versions each sample has: 1 to 4, fixed by its slug. */
const versionCount = (slug: string) =>
	between(sequence(`agent:${slug}:versions`), 1, 4);

export const SAMPLE_AGENTS: readonly AgentTemplate[] = AGENT_SEEDS.map(
	(seed) => {
		const key = `agent:${seed.slug}`;
		return {
			id: sampleUuid(key),
			slug: seed.slug,
			name: seed.name,
			kind: seed.kind,
			roles: seed.roles,
			// Shared identities: one template serves every engagement.
			engagementId: null,
			waveDefaults: seed.waveDefaults,
			identityMd: identityText(seed),
			depthMd: "",
			writablePaths: seed.writablePaths,
			version: versionCount(seed.slug),
			createdAt: isoDay(6, 1),
			updatedAt: isoDay(10, 1),
		};
	},
);

export function sampleAgent(slug: string): AgentTemplate | undefined {
	return SAMPLE_AGENTS.find((agent) => agent.slug === slug);
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
	identityTokens: number;
	discipline: SampleDiscipline[];
	outcomes: SampleOutcome[];
	reconstructed: SampleReconstructedRun[];
};

/** The cap the generator's output is held to (DATA-CONTRACTS-V2.md). */
export const IDENTITY_TOKEN_CAP = 800;

const MISSION_TEMPLATES = ["template-booking", "template-fullstack"] as const;
const ENGAGEMENTS = {
	client: ["Meridian booking", "Harbor clinic"],
	internal: ["AVEL itself"],
} as const;

function versionsOf(agent: AgentTemplate): SampleVersion[] {
	const next = sequence(`agent:${agent.slug}:history`);
	return Array.from({ length: agent.version }, (_, i) => {
		const version = agent.version - i;
		const role = agent.roles[Math.floor(next() * agent.roles.length)];
		return {
			version,
			sha256: sampleSha256(`agent:${agent.slug}:v${version}`),
			createdAt: isoDay(10 - i, between(next, 1, 28)),
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

function outcomesOf(seed: AgentSeed): SampleOutcome[] {
	const rows: SampleOutcome[] = [];
	for (const origin of ["client", "internal"] as const) {
		for (const territory of seed.territories) {
			const id = `${seed.slug}:${origin}:${territory ?? "whole"}`;
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
	const seed = AGENT_SEEDS.find((s) => s.slug === agent.slug);
	const next = sequence(`agent:${agent.slug}:tokens`);
	return {
		versions: versionsOf(agent),
		identityTokens: between(next, 240, 760),
		discipline: disciplineOf(agent.slug),
		outcomes: seed ? outcomesOf(seed) : [],
		reconstructed: seed?.reconstructed
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
 * The skills an agent carries, through its roles. Role skills are part of
 * its identity; stack and domain skills arrive at dispatch, to agents whose
 * roles a skill is recommended for.
 */
export function skillsOfAgent(agent: AgentTemplate): {
	role: SkillListItem[];
	dispatch: SkillListItem[];
} {
	const carried = SAMPLE_SKILLS.filter((skill) =>
		shares(skill.recommendedFor, agent.roles),
	);
	return {
		role: carried.filter((skill) => skill.layer === "role"),
		dispatch: carried.filter((skill) => skill.layer !== "role"),
	};
}

/** The agents that carry a skill: those covering a role it is for. */
export function agentsOfSkill(skill: SkillListItem): AgentTemplate[] {
	return SAMPLE_AGENTS.filter((agent) =>
		shares(agent.roles, skill.recommendedFor),
	);
}
