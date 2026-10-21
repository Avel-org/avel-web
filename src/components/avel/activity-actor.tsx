import type { ActivityEntry } from "avel-server/contract";
import { useSessionState } from "@/lib/auth";
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
		<span className="inline-flex min-w-0 items-center gap-2">
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
				<ActivityActorName
					actor={entry.actor}
					data-testid={`activity-actor-agent-${entry.id}`}
				/>
			</span>
		</span>
	);
}

/**
 * The actor's name. The contract names an operator only by GitHub login
 * (actor.display) and their user id, so the signed-in operator's own
 * entries read "You", with the login on hover: the log is mostly one
 * person's, and their own login on every row reads as an id. Another
 * operator, or any operator while the session is unknown, keeps the login.
 */
export function ActivityActorName({
	actor,
	"data-testid": testId,
}: {
	actor: ActivityEntry["actor"];
	"data-testid"?: string;
}) {
	const session = useSessionState();
	const self =
		actor.kind === "operator" &&
		actor.userId !== null &&
		session.status === "signed-in" &&
		session.user.id === actor.userId;
	if (self)
		return (
			<span data-actor-self="true" title={actor.display}>
				You
			</span>
		);
	return <ActorLabel actor={actor} data-testid={testId} />;
}
