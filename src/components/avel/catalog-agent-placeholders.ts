/**
 * Agent-only samples for /catalog/agents' spec console: each role's side,
 * what each role produces and reads, the artifact edges between agents, and
 * dispatch token estimates. None of these has a contract shape; the side and
 * the produce/consume pairs are client copies of design data in avel-server's
 * docs (ROSTER-V2.md, ROLES.md), so they are samples behind a pill like the
 * rest, never presented as live. Every value here derives from a live
 * template's own fields (its slug, roles and waveDefaults). Shared catalog
 * samples (versions, measures, families) stay in catalog-placeholders.ts.
 */
import type { AgentTemplate, Role, Wave } from "avel-server/contract";
import { WAVES } from "avel-server/contract";
import {
	SAMPLE_ROLE_FAMILY,
	sampleHistory,
	sampleSha256,
} from "./catalog-placeholders";

/** The source each agent-only sample stands in for, named in its pill. */
export const AGENT_MISSING = {
	sides: "each role's side",
	edges: "the artifact edge graph",
	dispatch: "dispatch token estimates",
	territories: "the roster's territories",
} as const;

export type AgentMissing = (typeof AGENT_MISSING)[keyof typeof AGENT_MISSING];

// ---------------------------------------------------------------------------
// Sides (ROSTER-V2.md, Merging roles into agents).

export type AgentSide = "author" | "tester" | "judge" | "fixture";

/**
 * A role's side, from its family: Foundation and Build author source, Verify
 * tests it, Review and incident-response judge it, and the fixture stands
 * alone. Operate's code roles, Firm and Platform have no side: they never
 * merge into a mission agent.
 */
export function sideOfRole(role: Role): AgentSide | null {
	if (role === "fixture") return "fixture";
	if (role === "incident-response") return "judge";
	switch (SAMPLE_ROLE_FAMILY[role]) {
		case "Foundation":
		case "Build":
			return "author";
		case "Verify":
			return "tester";
		case "Review":
			return "judge";
		default:
			return null;
	}
}

/**
 * An agent's side: the one side its roles share. Roles never merge across a
 * side, so a well-formed template has at most one; null when its roles have
 * none (Canon's Firm roles).
 */
export function sideOf(agent: Pick<AgentTemplate, "roles">): AgentSide | null {
	const sides = new Set(
		agent.roles.map(sideOfRole).filter((s): s is AgentSide => s !== null),
	);
	return sides.size === 1 ? ([...sides][0] ?? null) : null;
}

export const SIDES: readonly AgentSide[] = [
	"author",
	"tester",
	"judge",
	"fixture",
];

// ---------------------------------------------------------------------------
// Artifacts (ROLES.md, The catalog: Produces and Consumes).

/**
 * What each role produces and reads, as short artifact names. Keyed on the
 * contract's Role union with `satisfies`, so a role the server adds fails the
 * build until its artifacts are named here. "Implementation" in ROLES.md is
 * spelled out as the build roles' outputs, so judges draw edges from them.
 */
export const ROLE_ARTIFACTS = {
	foundations: {
		produces: "composition-root",
		consumes: ["repository", "conventions"],
	},
	schema: { produces: "migrations", consumes: ["brief", "conventions"] },
	contract: { produces: "contract.ts", consumes: ["brief", "migrations"] },
	"design-system": {
		produces: "tokens.css",
		consumes: ["brief", "brand-tokens"],
	},
	fixture: { produces: "golden/", consumes: ["render-spec"] },
	domain: { produces: "services", consumes: ["contract.ts", "migrations"] },
	"api-surface": { produces: "routes", consumes: ["contract.ts", "services"] },
	integration: {
		produces: "connectors",
		consumes: ["contract.ts", "third-party-specs"],
	},
	realtime: { produces: "sockets", consumes: ["contract.ts"] },
	auth: {
		produces: "guards",
		consumes: ["contract.ts", "migrations", "permission-policy"],
	},
	state: { produces: "state", consumes: ["contract.ts"] },
	interface: { produces: "screens", consumes: ["state", "tokens.css"] },
	"backend-tests": {
		produces: "backend.test",
		consumes: ["contract.ts", "acceptance-criteria"],
	},
	"frontend-tests": {
		produces: "e2e.test",
		consumes: ["acceptance-criteria", "screens"],
	},
	"property-tests": {
		produces: "property.test",
		consumes: ["contract.ts", "invariants"],
	},
	accessibility: { produces: "a11y-scan", consumes: ["screens"] },
	performance: { produces: "perf-budget", consumes: ["screens", "budget"] },
	"spec-check": {
		produces: "uncovered-criteria",
		consumes: ["acceptance-criteria", "test-tags"],
	},
	"spec-judgment": {
		produces: "findings/spec",
		consumes: ["brief", "services", "routes", "screens", "uncovered-criteria"],
	},
	"security-review": {
		produces: "findings/security",
		consumes: ["security-surface", "static-analysis", "permission-policy"],
	},
	"compliance-review": {
		produces: "findings/compliance",
		consumes: ["compliance-rules"],
	},
	adversarial: { produces: "crashes", consumes: ["endpoints"] },
	reconciliation: {
		produces: "findings/data",
		consumes: ["source-data", "target-data"],
	},
	concurrency: { produces: "findings/race", consumes: ["load-test-output"] },
	deploy: { produces: "deployment", consumes: ["package"] },
	recovery: { produces: "rollback", consumes: ["deploy-config"] },
	observability: { produces: "signals", consumes: ["running-system"] },
	"incident-response": { produces: "incident-report", consumes: ["signals"] },
	intake: { produces: "brief", consumes: ["client-input"] },
	strategy: { produces: "scope", consumes: ["brief", "engagement-history"] },
	research: { produces: "research", consumes: ["question"] },
	"client-ops": { produces: "client-message", consumes: ["engagement-state"] },
	knowledge: {
		produces: "knowledge",
		consumes: ["findings", "mission-records"],
	},
	render: { produces: "package", consumes: ["mission", "roster", "playbook"] },
	"ship-decision": { produces: "verdict", consumes: ["findings"] },
} as const satisfies Record<
	Role,
	{ produces: string; consumes: readonly string[] }
>;

/** An artifact as an edge carries it: its name and its sample hash. */
export type SampleArtifact = { name: string; sha256: string };

const artifact = (name: string): SampleArtifact => ({
	name,
	sha256: sampleSha256(`artifact:${name}`),
});

/** "contract.ts@9f1c": the artifact and the first four characters of its hash. */
export const artifactLabel = (a: SampleArtifact) =>
	`${a.name}@${a.sha256.slice(0, 4)}`;

/** What an agent writes and reads, through all its roles. */
export function artifactsOf(agent: Pick<AgentTemplate, "roles">): {
	writes: SampleArtifact[];
	reads: SampleArtifact[];
} {
	const writes = [
		...new Set(agent.roles.map((role) => ROLE_ARTIFACTS[role].produces)),
	];
	// Reading its own output is not an edge, so no agent is its own consumer.
	const reads = [
		...new Set(
			agent.roles.flatMap((role) => [...ROLE_ARTIFACTS[role].consumes]),
		),
	].filter((name) => !(writes as string[]).includes(name));
	return { writes: writes.map(artifact), reads: reads.map(artifact) };
}

/** One producer-to-consumer edge, with every artifact it carries. */
export type SampleEdge = {
	from: string;
	to: string;
	artifacts: SampleArtifact[];
};

/** Every edge between these agents: a producer's output a consumer reads. */
export function sampleEdges(agents: readonly AgentTemplate[]): SampleEdge[] {
	const edges: SampleEdge[] = [];
	for (const producer of agents) {
		const { writes } = artifactsOf(producer);
		for (const consumer of agents) {
			const { reads } = artifactsOf(consumer);
			const carried = writes.filter((w) =>
				reads.some((r) => r.name === w.name),
			);
			if (carried.length > 0) {
				edges.push({
					from: producer.slug,
					to: consumer.slug,
					artifacts: carried,
				});
			}
		}
	}
	return edges;
}

// ---------------------------------------------------------------------------
// Waves.

/**
 * A firm agent works for the agency between missions (Canon, Trace, Uno):
 * every role it covers is in the Firm family. Its firm roster entry has no
 * waves (DATA-CONTRACTS-V2.md, RosterEntry), so it never joins a mission's
 * wave columns, whatever its template's waveDefaults say.
 */
export function isFirmAgent(agent: Pick<AgentTemplate, "roles">): boolean {
	return (
		agent.roles.length > 0 &&
		agent.roles.every((role) => SAMPLE_ROLE_FAMILY[role] === "Firm")
	);
}

/** An agent's first default wave, A to E: its column in the graph. */
export function firstWave(agent: Pick<AgentTemplate, "waveDefaults">): Wave {
	return (
		[...agent.waveDefaults].sort(
			(a, b) => WAVES.indexOf(a) - WAVES.indexOf(b),
		)[0] ?? "A"
	);
}

// ---------------------------------------------------------------------------
// Dispatch token estimates.

export type SampleDispatch = {
	estimate: number;
	softCeiling: number;
	hardCeiling: number;
};

/** A deterministic integer in [low, high] from the key's sample hash. */
function fromHash(key: string, low: number, high: number): number {
	const n = Number.parseInt(sampleSha256(key).slice(0, 8), 16);
	return low + (n % (high - low + 1));
}

/** One agent's token estimate and ceilings, fixed by its slug. */
export function sampleDispatch(
	agent: Pick<AgentTemplate, "slug">,
): SampleDispatch {
	const estimate = fromHash(`dispatch:${agent.slug}`, 18, 120) * 1000;
	return {
		estimate,
		softCeiling: Math.round(estimate * 1.5),
		hardCeiling: estimate * 2,
	};
}

/** "48k": tokens in thousands, for a dense column. */
export const kTokens = (n: number) => `${Math.round(n / 1000)}k`;

// ---------------------------------------------------------------------------
// Territories. A template has none of its own: a territory is where a
// roster places a feature agent. The samples take them from the outcome
// rows, so the table and the measures always agree.

/** A feature agent's territories, in order; empty for a horizontal one. */
export function territoriesOf(agent: AgentTemplate): string[] {
	return [
		...new Set(
			sampleHistory(agent)
				.outcomes.map((row) => row.territory)
				.filter((t): t is string => t !== null),
		),
	];
}

// ---------------------------------------------------------------------------
// The panel's overview: four measures on client runs, this version against
// the previous one. Client runs only, so nothing adds client to internal.

export type SampleOverview = {
	firstPassGateRate: number;
	tokensActual: number;
	tokensEstimate: number;
	boundaryViolations: number;
	blockersFiled: number;
	/** Runs halted at a hard ceiling. */
	halts: number;
};

function overviewAt(slug: string, version: number): SampleOverview {
	const key = `overview:${slug}:v${version}`;
	const tokensEstimate = sampleDispatch({ slug }).estimate;
	return {
		firstPassGateRate: fromHash(`${key}:gate`, 40, 96) / 100,
		tokensActual: Math.round(
			(tokensEstimate * fromHash(`${key}:tokens`, 70, 135)) / 100,
		),
		tokensEstimate,
		boundaryViolations: Math.max(0, fromHash(`${key}:violations`, -3, 2)),
		blockersFiled: fromHash(`${key}:blockers`, 0, 6),
		halts: Math.max(0, fromHash(`${key}:halts`, -4, 1)),
	};
}

/** The current version's overview, and the previous one's when there is one. */
export function sampleOverview(
	agent: Pick<AgentTemplate, "slug" | "version">,
): {
	current: SampleOverview;
	previous: SampleOverview | null;
} {
	return {
		current: overviewAt(agent.slug, agent.version),
		previous:
			agent.version > 1 ? overviewAt(agent.slug, agent.version - 1) : null,
	};
}

/**
 * The status box, by rule and nothing else: good when there are no boundary
 * violations and no halts; otherwise each measure that is not zero, by name.
 */
export function agentStatus(o: SampleOverview): {
	ok: boolean;
	problems: string[];
} {
	const problems = [
		o.boundaryViolations > 0
			? `${o.boundaryViolations} boundary ${o.boundaryViolations === 1 ? "violation" : "violations"}`
			: null,
		o.halts > 0
			? `${o.halts} ${o.halts === 1 ? "run" : "runs"} halted at a ceiling`
			: null,
	].filter((p): p is string => p !== null);
	return { ok: problems.length === 0, problems };
}

/** The edges touching one agent: what it reads from whom, writes to whom. */
export function edgesOf(
	agent: Pick<AgentTemplate, "slug">,
	agents: readonly AgentTemplate[],
): { incoming: SampleEdge[]; outgoing: SampleEdge[] } {
	const edges = sampleEdges(agents);
	return {
		incoming: edges.filter((e) => e.to === agent.slug),
		outgoing: edges.filter((e) => e.from === agent.slug),
	};
}
