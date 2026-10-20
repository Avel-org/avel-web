import { Link } from "@tanstack/react-router";
import type { ActivityEntry, AgentTemplate } from "avel-server/contract";
import { useAllTemplates } from "./preset-detail";
import { ShortHash } from "./short-hash";

/*
 * An agent template in the log. Its entries carry only the template's id
 * (identity_regenerated logs {number, sha256}), so the agent is named from
 * the catalog, read once and cached. "Agent" stands in while the catalog
 * loads, or when the agent has since been deleted; the id never does.
 */

type AgentEntry = Pick<ActivityEntry, "action" | "entityId" | "payload">;

const SHA256 = /^[0-9a-f]{64}$/;

/** The version a regeneration made, "atlas@v3" and its hash, when logged. */
export function regenerated(
	entry: AgentEntry,
	slug: string,
): { ref: string; sha256: string } | null {
	if (entry.action !== "agent_template.identity_regenerated") return null;
	const { number, sha256 } = entry.payload;
	return typeof number === "number" &&
		Number.isInteger(number) &&
		number > 0 &&
		typeof sha256 === "string" &&
		SHA256.test(sha256)
		? { ref: `${slug}@v${number}`, sha256 }
		: null;
}

/** The entry's agent from the catalog, or undefined while it loads or once deleted. */
function useAgent(
	entry: AgentEntry,
): Pick<AgentTemplate, "name" | "slug"> | undefined {
	const all = useAllTemplates();
	return all.status === "success" ? all.byId.get(entry.entityId) : undefined;
}

/** " as atlas@v3", then the version's hash, with Copy. */
function Made({ made }: { made: { ref: string; sha256: string } }) {
	return (
		<>
			{" as "}
			<span className="type-mono">{made.ref}</span>{" "}
			<ShortHash value={made.sha256} label={`the hash of ${made.ref}`} />
		</>
	);
}

/** A log row's target: the agent's name, linked to its page, and what it made. */
export function AgentTarget({
	entry,
	testId,
	linkClass,
}: {
	entry: AgentEntry;
	testId: string;
	linkClass: string;
}) {
	const agent = useAgent(entry);
	if (!agent)
		return (
			<span data-testid={testId} className="type-small text-text-muted">
				<span title={entry.entityId}>Agent</span>
			</span>
		);
	const made = regenerated(entry, agent.slug);
	return (
		<span data-testid={testId} className="type-small text-text-muted">
			<Link
				to="/catalog/agents/$slug"
				params={{ slug: agent.slug }}
				title={entry.entityId}
				className={linkClass}
			>
				{agent.name}
			</Link>
			{made ? <Made made={made} /> : null}
		</span>
	);
}

/**
 * The decision record's "What it did" for an agent: "Atlas: identity
 * regenerated as atlas@v3", or the action and the agent's name.
 */
export function AgentDid({
	entry,
	action,
}: {
	entry: AgentEntry;
	/** The action's words, "Agent changed". */
	action: string;
}) {
	const agent = useAgent(entry);
	const made = agent ? regenerated(entry, agent.slug) : null;
	if (agent && made)
		return (
			<span title={entry.entityId}>
				{`${agent.name}: identity regenerated`}
				<Made made={made} />
			</span>
		);
	return (
		<span title={entry.entityId}>{`${action}: ${agent?.name ?? "Agent"}`}</span>
	);
}
