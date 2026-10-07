import type { ActivityEntry } from "avel-server/contract";

/**
 * The "who" of one entry: the server's display label for the actor (an
 * operator's GitHub login, "System", or an agent as "Name · territory").
 * Never an id. The kind rides along as data-actor-kind, for styling.
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
			{entry.actor.display}
		</span>
	);
}
