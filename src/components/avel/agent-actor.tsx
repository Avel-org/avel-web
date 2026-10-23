import { Link } from "@tanstack/react-router";
import type { ActivityActor } from "avel-server/contract";

/*
 * Who acted, wherever an activity row names them: the activity feed, the
 * audit table and its record, an agent's and a client's activity, a
 * mission's recent activity and a preset's history. An agent is its name,
 * linked to its catalog page, with its territory beside it; an operator is
 * their login and the system is "AVEL runner", as the server displays them.
 * Never an id.
 */

/**
 * Underlined faintly at rest, as the activity feed's links are, so the name
 * reads as a link inside plain text; hover brings the line to full strength.
 * It keeps the size and colour of the text around it.
 */
const LINK_CLASS =
	"py-1.5 -my-1.5 underline decoration-border underline-offset-2 hover:text-foreground hover:decoration-current";

/** An agent: its name to its catalog page, then its territory, secondary. */
export function AgentActor({
	agent,
	"data-testid": testId,
}: {
	agent: NonNullable<ActivityActor["agent"]>;
	"data-testid"?: string;
}) {
	return (
		<>
			<Link
				to="/catalog/agents/$slug"
				params={{ slug: agent.slug }}
				data-testid={testId}
				className={LINK_CLASS}
				// A row that selects on click (the audit table) stays as it is.
				onClick={(event) => event.stopPropagation()}
			>
				{agent.name}
			</Link>
			{agent.territory ? (
				<span className="text-text-subtle">{`, ${agent.territory}`}</span>
			) : null}
		</>
	);
}

/**
 * Any actor: an agent as AgentActor, anyone else by the server's display.
 * `fallback` stands in for a display the wire allows to be null (a
 * mission's recent activity), which the server no longer sends.
 */
export function ActorLabel({
	actor,
	fallback = "",
	"data-testid": testId,
}: {
	actor: Pick<ActivityActor, "agent"> & { display: string | null };
	fallback?: string;
	"data-testid"?: string;
}) {
	return actor.agent ? (
		<AgentActor agent={actor.agent} data-testid={testId} />
	) : (
		(actor.display ?? fallback)
	);
}
