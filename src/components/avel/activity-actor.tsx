import type { ActivityEntry } from "avel-server/contract";
import { ActorMark } from "./actor";
import { ActorLabel } from "./agent-actor";

/**
 * The "who" of one entry: an agent by name, linked to its catalog page,
 * with its territory beside it; an operator by GitHub login; the system
 * as "AVEL runner", the server's display. Never an id. The actor's mark
 * (a person, an agent's tile, the runner's chip) leads it, so who acted
 * reads at a glance (audit F3); the kind rides along as data-actor-kind.
 */
export function ActivityActor({
	entry,
}: {
	entry: Pick<ActivityEntry, "id" | "actor">;
}) {
	return (
		<span className="inline-flex min-w-0 items-center gap-1.5">
			<ActorMark
				kind={entry.actor.kind}
				name={entry.actor.agent?.name}
				data-testid={`activity-actor-mark-${entry.id}`}
			/>
			<span
				data-testid={`activity-actor-${entry.id}`}
				data-actor-kind={entry.actor.kind}
				className="type-small text-text-muted"
			>
				<ActorLabel
					actor={entry.actor}
					data-testid={`activity-actor-agent-${entry.id}`}
				/>
			</span>
		</span>
	);
}
