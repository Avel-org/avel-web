import type { ActivityEntry } from "avel-server/contract";
import { ActorLabel } from "./agent-actor";

/**
 * The "who" of one entry: an agent by name, linked to its catalog page,
 * with its territory beside it; an operator by GitHub login; the system
 * as "AVEL runner", the server's display. Never an id. The kind rides
 * along as data-actor-kind, for styling.
 */
export function ActivityActor({
	entry,
}: {
	entry: Pick<ActivityEntry, "id" | "actor">;
}) {
	return (
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
	);
}
