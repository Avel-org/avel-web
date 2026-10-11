import { QueryClient } from "@tanstack/react-query";
import {
	createMemoryHistory,
	createRouter,
	RouterContextProvider,
	RouterProvider,
} from "@tanstack/react-router";
import type {
	AgentTemplate,
	Connection,
	PageMeta,
	Skill,
	SkillSource,
} from "avel-server/contract";
import type { ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ApiError, ApiOverrideProvider, ApiProvider } from "@/lib/api";
import { CATALOG_PAGE_SIZE } from "@/lib/api/catalog";
import {
	CONNECTIONS_PAGE_SIZE,
	type ConnectionsPage,
} from "@/lib/api/connections";
import { queryKeys } from "@/lib/api/keys";
import { SessionSourceProvider } from "@/lib/auth";
import { routeTree } from "../src/routeTree.gen";
import { signedIn } from "./auth-session";

/**
 * Shared fixtures for the catalog and connection tests. Not a test file:
 * vitest collects only *.test.ts(x). Every shape is the contract's own type,
 * with no cast, so a contract change these no longer satisfy fails the
 * typecheck. Pages render through the real router with a QueryClient seeded
 * with these, the way the Clients tests do: server rendering never runs a
 * query, so a seeded cache is the only way a page can reach its success,
 * empty or error state.
 */

const ID = (n: number) =>
	`00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

/** A 64-character hex value, its own per n. Not a real hash. */
const hex = (n: number) => String(n).padStart(2, "0").repeat(32);

const AT = "2026-09-07T09:00:00.000Z";

// ---------------------------------------------------------------------------
// Agent templates. One of each shape the pages tell apart: feature and
// horizontal, every side, a firm agent, versions above and at 1.

type AgentSeed = Pick<
	AgentTemplate,
	"slug" | "name" | "kind" | "roles" | "waveDefaults" | "writablePaths"
> & { version: number };

const AGENT_SEEDS: readonly AgentSeed[] = [
	{
		slug: "atlas",
		name: "Atlas",
		kind: "feature",
		// Out of catalog order on purpose: the page sorts by ROLES, not by the data.
		roles: ["api-surface", "domain"],
		waveDefaults: ["B"],
		writablePaths: ["src/server/**", "!**/*.test.ts"],
		version: 3,
	},
	{
		slug: "leonora",
		name: "Leonora",
		kind: "horizontal",
		roles: ["schema", "contract"],
		waveDefaults: ["A"],
		writablePaths: ["src/db/**", "src/contract/**", "!**/*.test.ts"],
		version: 2,
	},
	{
		slug: "leon",
		name: "Leon",
		kind: "feature",
		roles: ["interface", "state"],
		waveDefaults: ["B"],
		writablePaths: ["src/app/**", "!**/*.test.ts"],
		version: 1,
	},
	{
		slug: "nemi",
		name: "Nemi",
		kind: "horizontal",
		roles: ["frontend-tests"],
		waveDefaults: ["C"],
		writablePaths: ["tests/e2e/**", "**/*.test.tsx"],
		version: 1,
	},
	{
		slug: "iyo",
		name: "Iyo",
		kind: "horizontal",
		roles: ["backend-tests", "property-tests"],
		waveDefaults: ["C"],
		writablePaths: ["tests/**", "**/*.test.ts"],
		version: 1,
	},
	{
		slug: "brennan",
		name: "Brennan",
		kind: "horizontal",
		roles: ["spec-judgment"],
		waveDefaults: ["D"],
		writablePaths: ["findings/spec-judgment/**"],
		version: 2,
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
		version: 1,
	},
	{
		slug: "canon",
		name: "Canon",
		kind: "horizontal",
		roles: ["intake", "strategy"],
		waveDefaults: ["A"],
		writablePaths: [],
		version: 1,
	},
];

export const AGENTS: readonly AgentTemplate[] = AGENT_SEEDS.map((seed, i) => ({
	id: ID(100 + i),
	engagementId: null,
	identityMd: [
		`# ${seed.name}`,
		"",
		"Generated from roles. Do not edit by hand.",
		"",
		"## Boundaries",
		"- Write only inside the mount for these roles.",
	].join("\n"),
	depthMd: "",
	createdAt: AT,
	updatedAt: AT,
	...seed,
}));

export function agent(slug: string): AgentTemplate {
	const found = AGENTS.find((a) => a.slug === slug);
	if (!found) throw new Error(`no fixture agent ${slug}`);
	return found;
}

// ---------------------------------------------------------------------------
// Sources and skills. The skills name their sources; the sources count
// their skills, so the two agree.

const SOURCE_ID = { avel: ID(200), vendor: ID(201), community: ID(202) };

type SkillSeed = Pick<
	Skill,
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
		source: keyof typeof SOURCE_ID;
		contentMd: string;
		avelEnhancementMd?: string;
	};

const SKILL_SEEDS: readonly SkillSeed[] = [
	{
		slug: "property-testing-fast-check",
		name: "Property testing with fast-check",
		description:
			"Use when a function has an invariant the spec states. Write it as a property before any example.",
		layer: "role",
		type: "knowledge",
		grants: null,
		ioShape: null,
		recommendedFor: ["property-tests"],
		source: "avel",
		status: "approved",
		contentMd:
			"# Property testing with fast-check\n\n1. State the invariant.\n2. Write it as a property.",
	},
	{
		slug: "agreeing-wrong-tests",
		name: "Code and tests that agree and are both wrong",
		description:
			"Use when judging an implementation whose tests pass. Read the brief first.",
		layer: "role",
		type: "knowledge",
		grants: null,
		ioShape: null,
		recommendedFor: ["spec-judgment"],
		source: "avel",
		status: "approved",
		contentMd:
			"# Code and tests that agree and are both wrong\n\n- Read the brief before the code.",
	},
	{
		slug: "criterion-tags",
		name: "Tagging every test with its acceptance criterion",
		description:
			"Use when writing any test. Tag it with the criterion it covers.",
		layer: "role",
		type: "knowledge",
		grants: null,
		ioShape: null,
		recommendedFor: ["backend-tests", "frontend-tests", "property-tests"],
		source: "avel",
		status: "approved",
		contentMd:
			"# Tagging every test with its acceptance criterion\n\n- One criterion per test.",
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
		source: "vendor",
		status: "approved",
		contentMd:
			"# Next.js route groups and route handlers\n\n- Group routes with `(folder)`.",
		avelEnhancementMd:
			"## AVEL's additions\n\n- Every handler parses its body with the contract's schema.",
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
		source: "community",
		status: "draft",
		contentMd:
			"# Read access to the database\n\n- Connect with the read-only role.",
		avelEnhancementMd:
			"## AVEL's additions\n\n- The connection string comes from the room.",
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
		source: "avel",
		status: "retired",
		contentMd:
			"# The package registry\n\n- Install only what the lockfile names.",
	},
];

const SOURCE_SEED: Record<
	keyof typeof SOURCE_ID,
	Pick<SkillSource, "name" | "kind" | "url" | "license">
> = {
	avel: { name: "AVEL", kind: "internal", url: null, license: null },
	vendor: {
		name: "Framework vendor pack",
		kind: "vendor",
		url: "https://example.com/vendor/skills",
		license: "Apache-2.0",
	},
	community: {
		name: "Community skills index",
		kind: "community",
		url: "https://example.org/skills-index",
		license: "MIT",
	},
};

/** Each skill as get returns it: the list item plus its text. */
export const SKILLS: readonly Skill[] = SKILL_SEEDS.map(
	({ source, avelEnhancementMd, ...seed }, i): Skill => {
		const reviewed = seed.status !== "draft";
		return {
			...seed,
			id: ID(300 + i),
			source: {
				id: SOURCE_ID[source],
				name: SOURCE_SEED[source].name,
				kind: SOURCE_SEED[source].kind,
			},
			contentSha256: hex(30 + i),
			reviewedBy: reviewed ? ID(1) : null,
			reviewedAt: reviewed ? AT : null,
			version: 1,
			createdAt: AT,
			updatedAt: AT,
			avelEnhancementMd: avelEnhancementMd ?? null,
		};
	},
);

export function skill(slug: string): Skill {
	const found = SKILLS.find((s) => s.slug === slug);
	if (!found) throw new Error(`no fixture skill ${slug}`);
	return found;
}

export const SOURCES: readonly SkillSource[] = (
	Object.keys(SOURCE_ID) as (keyof typeof SOURCE_ID)[]
).map((key) => ({
	...SOURCE_SEED[key],
	id: SOURCE_ID[key],
	skillCount: SKILLS.filter((s) => s.source.id === SOURCE_ID[key]).length,
	createdAt: AT,
	updatedAt: AT,
}));

export function source(kind: SkillSource["kind"]): SkillSource {
	const found = SOURCES.find((s) => s.kind === kind);
	if (!found) throw new Error(`no fixture source of kind ${kind}`);
	return found;
}

// ---------------------------------------------------------------------------
// Connections, in the dev seed's shape: four active, one revoked.

export function connection(
	n: number,
	overrides: Partial<Connection> = {},
): Connection {
	return {
		id: ID(400 + n),
		service: "github",
		engagementId: ID(500 + n),
		label: `Connection ${n}`,
		scopeType: "repo",
		scopeValue: `owner-${n}/repo-${n}`,
		credentialRef: "GITHUB_TOKEN",
		status: "active",
		expiresAt: null,
		lastRotatedAt: null,
		revokedAt: null,
		createdAt: AT,
		updatedAt: AT,
		...overrides,
	};
}

export const CONNECTIONS: readonly Connection[] = [
	connection(1, {
		label: "Halvorsen portal",
		scopeValue: "halvorsen-pike/portal",
	}),
	connection(2, {
		label: "Larchmont routes",
		scopeValue: "larchmont-freight/routes",
		status: "revoked",
		revokedAt: "2026-09-27T09:00:00.000Z",
	}),
	connection(3, {
		label: "Halvorsen billing",
		scopeValue: "halvorsen-pike/billing",
	}),
	connection(4, {
		label: "AVEL internal",
		engagementId: null,
		scopeType: "owner",
		scopeValue: "avel-org",
	}),
	connection(5, {
		label: "Brightwater booking",
		scopeValue: "brightwater-clinics/booking",
		status: "expired",
		expiresAt: "2026-10-01T09:00:00.000Z",
	}),
];

// ---------------------------------------------------------------------------
// Errors, as the data layer throws them.

/** avel-server failed: INTERNAL, which a read may retry. */
export function internalError(path: string): ApiError {
	return new ApiError({
		method: "GET",
		path,
		kind: "contract",
		status: 500,
		code: "INTERNAL",
		message: "server message, never shown",
		requestId: "req_catalog",
	});
}

/** A stale slug: the route answered NOT_FOUND. */
export function notFoundError(path: string): ApiError {
	return new ApiError({
		method: "GET",
		path,
		kind: "contract",
		status: 404,
		code: "NOT_FOUND",
		message: "server message, never shown",
		requestId: "req_catalog",
	});
}

// ---------------------------------------------------------------------------
// A seeded QueryClient.

/** A first page: its rows, and meta.total (the rows' count unless given). */
export type ListSeed<T> =
	| readonly T[]
	| { rows: readonly T[]; total?: number; nextCursor?: string };

function firstPage<T>(seed: ListSeed<T>): { data: T[]; meta: PageMeta } {
	const rows = Array.isArray(seed)
		? seed
		: (seed as { rows: readonly T[] }).rows;
	const more = Array.isArray(seed)
		? {}
		: (seed as { total?: number; nextCursor?: string });
	return {
		data: [...rows],
		meta: {
			nextCursor: more.nextCursor ?? null,
			total: more.total ?? rows.length,
		},
	};
}

const infinite = <P,>(page: P) => ({ pages: [page], pageParams: [undefined] });

export type Seed = {
	agents?: ListSeed<AgentTemplate> | ApiError;
	/** Templates by slug, or the error their fetch failed with. */
	agentBySlug?: Record<string, AgentTemplate | ApiError>;
	skills?: ListSeed<Skill> | ApiError;
	skillBySlug?: Record<string, Skill | ApiError>;
	sources?: ListSeed<SkillSource> | ApiError;
	connections?: ListSeed<Connection> | ApiError;
};

/**
 * A QueryClient holding exactly what the seed names. An unseeded query stays
 * pending, which on the server is the loading state. A seeded error stays an
 * error instead of refetching on mount.
 */
export function seededClient(seed: Seed = {}): QueryClient {
	const client = new QueryClient({
		defaultOptions: {
			queries: {
				retry: false,
				retryOnMount: false,
				staleTime: Number.POSITIVE_INFINITY,
			},
		},
	});
	const fail = (queryKey: readonly unknown[], error: ApiError) =>
		client
			.getQueryCache()
			.build(client, { queryKey })
			.setState({ status: "error", fetchStatus: "idle", error });

	const agentsKey = queryKeys.catalog.agentTemplates(CATALOG_PAGE_SIZE);
	if (seed.agents instanceof ApiError) fail(agentsKey, seed.agents);
	else if (seed.agents) {
		client.setQueryData(agentsKey, infinite(firstPage(seed.agents)));
	}
	for (const [slug, value] of Object.entries(seed.agentBySlug ?? {})) {
		const key = queryKeys.catalog.agentTemplate(slug);
		if (value instanceof ApiError) fail(key, value);
		else client.setQueryData(key, value);
	}

	const skillsKey = queryKeys.catalog.skills(CATALOG_PAGE_SIZE);
	if (seed.skills instanceof ApiError) fail(skillsKey, seed.skills);
	else if (seed.skills) {
		client.setQueryData(skillsKey, infinite(firstPage(seed.skills)));
	}
	for (const [slug, value] of Object.entries(seed.skillBySlug ?? {})) {
		const key = queryKeys.catalog.skill(slug);
		if (value instanceof ApiError) fail(key, value);
		else client.setQueryData(key, value);
	}

	const sourcesKey = queryKeys.catalog.skillSources(CATALOG_PAGE_SIZE);
	if (seed.sources instanceof ApiError) fail(sourcesKey, seed.sources);
	else if (seed.sources) {
		client.setQueryData(sourcesKey, infinite(firstPage(seed.sources)));
	}

	const connectionsKey = queryKeys.connections.list(CONNECTIONS_PAGE_SIZE);
	if (seed.connections instanceof ApiError) {
		fail(connectionsKey, seed.connections);
	} else if (seed.connections) {
		const page = firstPage(seed.connections);
		// This route always counts, so its page type requires the total.
		const counted: ConnectionsPage = {
			data: page.data,
			meta: { nextCursor: page.meta.nextCursor, total: page.meta.total ?? 0 },
		};
		client.setQueryData(connectionsKey, infinite(counted));
	}
	return client;
}

/** Everything a catalog page can read, all seeded: the common case. */
export function catalogSeed(): Seed {
	return {
		agents: AGENTS,
		agentBySlug: Object.fromEntries(AGENTS.map((a) => [a.slug, a])),
		skills: SKILLS,
		skillBySlug: Object.fromEntries(SKILLS.map((s) => [s.slug, s])),
		sources: SOURCES,
	};
}

// ---------------------------------------------------------------------------
// Rendering.

/**
 * A page rendered the way the server renders it, through the real router and
 * root layout, with the app's ApiProvider handed this QueryClient.
 */
export async function renderSeeded(
	path: string,
	queryClient: QueryClient,
): Promise<string> {
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

/**
 * One component alone, with what it needs around it: the data layer (seeded),
 * a router context for its links, and tooltips. A tenth of a page's cost.
 */
export function inProviders(
	node: ReactNode,
	queryClient: QueryClient,
	path = "/catalog/skills",
): string {
	const router = createRouter({
		routeTree,
		history: createMemoryHistory({ initialEntries: [path] }),
	});
	return renderToString(
		<ApiOverrideProvider queryClient={queryClient}>
			<ApiProvider>
				<RouterContextProvider router={router}>
					<TooltipProvider>{node}</TooltipProvider>
				</RouterContextProvider>
			</ApiProvider>
		</ApiOverrideProvider>,
	);
}
