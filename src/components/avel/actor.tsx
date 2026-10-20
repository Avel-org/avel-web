import type {
	ActivityActorKind,
	HaltReason,
	ReportFiledBy,
} from "avel-server/contract";
import { Cpu, MessagesSquare, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { HALT_REASON_LABEL } from "./dispatch-labels";

/*
 * Who acted, as a mark (audit F3): the operator is a person (a round
 * avatar), an agent is its tile (its initials on v3's ringed tile), and the
 * runner is a machine (a square-cornered chip with a processor). The three differ in
 * shape, so the mark reads without its colour or its label. A halt at a
 * ceiling carries the runner's mark, a halt by the operator the person's:
 * limits are enforced by the system, not by asking the agent.
 *
 * The mark is decorative beside a label that names the actor, so it is
 * hidden from screen readers.
 */

/** Who stopped a dispatch: the runner at a ceiling, or the operator. */
export const HALT_ACTOR = {
	token_hard_ceiling: "system",
	spend_ceiling: "system",
	wall_clock: "system",
	operator: "operator",
} as const satisfies Record<HaltReason, ActivityActorKind>;

/** Who filed a report: the agent, or the runner (the server's "system"). */
export const FILED_BY_ACTOR = {
	agent: "agent",
	system: "system",
} as const satisfies Record<ReportFiledBy, ActivityActorKind>;

/** Each kind in words, for a mark with no label beside it. */
export const ACTOR_KIND_LABEL = {
	operator: "Operator",
	agent: "Agent",
	system: "AVEL runner",
	canon: "Canon",
} as const satisfies Record<ActivityActorKind, string>;

const SHAPE = {
	operator: "rounded-full",
	// v3's small tile (.tile-sm) is radius-sm.
	agent: "rounded-sm",
	system: "rounded-none",
	// Canon, the project briefer, is round like a person but dashed: what it
	// says is a recommendation, never a check (the dashed ring's meaning).
	canon: "rounded-full border-dashed",
} as const satisfies Record<ActivityActorKind, string>;

/**
 * Two letters from an agent's name: "AT" for Atlas. The one rule for every
 * agent tile, so a tile reads the same wherever the agent appears.
 */
export const initialsOf = (name: string) => name.slice(0, 2).toUpperCase();

export function ActorMark({
	kind,
	name,
	size = "sm",
	"data-testid": testId,
	className,
}: {
	kind: ActivityActorKind;
	/** An agent's name, for its initials. Ignored for anyone else. */
	name?: string;
	/** sm beside a line of text; md, v3's .tile, leading a card. */
	size?: "sm" | "md";
	"data-testid"?: string;
	className?: string;
}) {
	return (
		<span
			aria-hidden="true"
			data-testid={testId}
			data-actor-mark={kind}
			className={cn(
				"inline-flex shrink-0 items-center justify-center border select-none",
				size === "md"
					? cn(
							"size-tile-md rounded-tile type-small [&_svg]:size-4",
							kind === "canon" && "border-dashed",
						)
					: cn("size-5 type-caption [&_svg]:size-3", SHAPE[kind]),
				kind === "system"
					? "border-border-strong bg-app-raised text-text-muted"
					: "border-border bg-app-panel text-text-muted",
				className,
			)}
		>
			{kind === "operator" ? (
				<UserRound />
			) : kind === "system" ? (
				<Cpu />
			) : kind === "canon" ? (
				<MessagesSquare />
			) : (
				<span className="leading-none font-semibold">
					{initialsOf(name ?? "")}
				</span>
			)}
		</span>
	);
}

/**
 * Why a dispatch halted, with who stopped it: the runner's mark and the
 * limit that tripped, or the operator's mark for a manual stop.
 */
export function HaltActor({
	reason,
	"data-testid": testId,
	className,
}: {
	reason: HaltReason;
	"data-testid"?: string;
	/** The label's tone, where the halt is the line's point. */
	className?: string;
}) {
	const kind = HALT_ACTOR[reason];
	return (
		<span
			data-testid={testId}
			data-actor-kind={kind}
			data-reason={reason}
			className={cn(
				"inline-flex items-center gap-1.5 type-small text-text-muted",
				className,
			)}
		>
			<ActorMark kind={kind} />
			{HALT_REASON_LABEL[reason]}
			{kind === "system" ? (
				<span className="sr-only">, by the AVEL runner</span>
			) : null}
		</span>
	);
}
