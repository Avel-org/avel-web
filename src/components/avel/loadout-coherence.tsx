import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
	type CoherenceResult,
	type MissionDetail,
	type Role,
	type RosterEntry,
	role as roleSchema,
	VERIFICATION_ROLES,
	WAVES,
	type Wave,
} from "avel-server/contract";
import { ArrowRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useApiClient } from "@/lib/api";
import { rosterQuery } from "@/lib/api/coherence";
import { blockCopy, useCoherence, warningCopy } from "./playbook-coherence";
import { StatusGlyph } from "./status-pill";
import { ErrorState, Surface } from "./surface";

/*
 * The loadout's coherence pane (ROUTES.md, /missions/:id/roster): the
 * contract's computeCoherence over the roster in the cache, so every roster
 * write shows here with no round trip. Each issue has a Resolve link that
 * puts `focus` in the URL; the board marks its targets with
 * data-loadout-focus and focuses the one named.
 */

/** What a Resolve link points the board at. */
type LoadoutFocus =
	/** A roster entry to turn on, or to give a wave. */
	| { kind: "entry"; id: string }
	/** A wave column with nothing to turn on in it. */
	| { kind: "wave"; wave: Wave }
	/** The first palette template holding a role, to add it. */
	| { kind: "role"; role: Role };

/** The `focus` search param, and the board's data-loadout-focus marker. */
export function focusParam(focus: LoadoutFocus): string {
	switch (focus.kind) {
		case "entry":
			return `entry:${focus.id}`;
		case "wave":
			return `wave:${focus.wave}`;
		case "role":
			return `role:${focus.role}`;
	}
}

/** The param back as a focus, or null for anything malformed. */
export function parseFocus(value: string | undefined): LoadoutFocus | null {
	if (!value) return null;
	const at = value.indexOf(":");
	const kind = value.slice(0, at);
	const rest = value.slice(at + 1);
	if (at < 1 || rest === "") return null;
	if (kind === "entry") return { kind, id: rest };
	if (kind === "wave") {
		const wave = WAVES.find((w) => w === rest);
		return wave ? { kind, wave } : null;
	}
	if (kind === "role") {
		const role = roleSchema.safeParse(rest);
		return role.success ? { kind, role: role.data } : null;
	}
	return null;
}

/**
 * Where to fix the first-wave block: an idle entry already in the wave
 * (turn it on), else an active entry (add the wave), else the wave's
 * column. Null when the playbook declares no waves: no roster fixes that.
 */
export function blockTarget(
	wave: Wave | null,
	roster: readonly RosterEntry[],
): LoadoutFocus | null {
	if (wave === null) return null;
	const idle = roster.find((e) => !e.active && e.waves.includes(wave));
	if (idle) return { kind: "entry", id: idle.id };
	const active = roster.find((e) => e.active);
	if (active) return { kind: "entry", id: active.id };
	return { kind: "wave", wave };
}

/** The roles each vertical-cut gap is filled by, in the contract's terms. */
const GAP_ROLES = {
	foundations: ["foundations"],
	verification: VERIFICATION_ROLES,
} as const satisfies Record<"foundations" | "verification", readonly Role[]>;

/**
 * Where to fill a vertical-cut gap: an idle entry holding one of its roles
 * (turn it on), else the palette's template for its first role.
 */
export function gapTarget(
	gap: keyof typeof GAP_ROLES,
	roster: readonly RosterEntry[],
): LoadoutFocus {
	const roles: readonly Role[] = GAP_ROLES[gap];
	const idle = roster.find(
		(e) => !e.active && e.agentTemplate.roles.some((r) => roles.includes(r)),
	);
	if (idle) return { kind: "entry", id: idle.id };
	return { kind: "role", role: roles[0] ?? "foundations" };
}

export function LoadoutCoherence({
	mission,
	missionType,
	readOnlyReason,
}: {
	mission: Pick<MissionDetail, "id" | "cut">;
	missionType: string;
	/**
	 * Why the roster cannot change, or null. The issues stay, since they are
	 * still true, but Resolve would lead to a board that cannot act on them.
	 */
	readOnlyReason: string | null;
}) {
	const result = useCoherence(mission, missionType);
	// The same cache entry coherence read, so targets match the verdict.
	const roster = useQuery(rosterQuery(useApiClient(), mission.id)).data ?? [];
	return (
		<Surface
			data-testid="loadout-coherence"
			query={result}
			loading={
				<div
					data-testid="loadout-coherence-skeleton"
					className="flex flex-col gap-2"
				>
					<Skeleton className="h-10 w-full" />
					<Skeleton className="h-10 w-full" />
				</div>
			}
			// A result always says something: clear is a verdict too.
			empty={null}
			isEmpty={() => false}
			error={ErrorState}
		>
			{(data) => (
				<LoadoutIssues
					result={data}
					roster={roster}
					missionId={mission.id}
					missionType={missionType}
					resolvable={readOnlyReason === null}
				/>
			)}
		</Surface>
	);
}

function ResolveLink({
	missionId,
	focus,
	label,
}: {
	missionId: string;
	focus: LoadoutFocus;
	label: string;
}) {
	const param = focusParam(focus);
	return (
		<Link
			to="/missions/$id/roster"
			params={{ id: missionId }}
			search={(prev) => ({ ...prev, focus: param })}
			data-testid={`loadout-resolve-${param}`}
			className="inline-flex items-center gap-1 type-caption text-accent-text underline-offset-4 hover:underline"
		>
			{label}
			<ArrowRight aria-hidden="true" className="size-3" />
		</Link>
	);
}

function LoadoutIssues({
	result,
	roster,
	missionId,
	missionType,
	resolvable,
}: {
	result: CoherenceResult;
	roster: readonly RosterEntry[];
	missionId: string;
	missionType: string;
	resolvable: boolean;
}) {
	const { block, warnings } = result;
	const target = block ? blockTarget(block.wave, roster) : null;
	return (
		<ul
			data-testid="loadout-issues"
			data-blocked={block !== undefined}
			className="flex flex-col gap-2"
		>
			{block ? (
				<li
					data-testid="loadout-coherence-block"
					data-wave={block.wave ?? "none"}
					className="flex flex-col gap-1.5 rounded-sm border border-gate-block-line bg-gate-block-soft p-2"
				>
					<span className="flex items-start gap-2 type-small text-foreground">
						<StatusGlyph tone="block" className="mt-1" />
						<span>{blockCopy(block)}</span>
					</span>
					{resolvable ? (
						<span className="pl-4">
							{target ? (
								<ResolveLink
									missionId={missionId}
									focus={target}
									label={
										target.kind === "entry"
											? `Resolve: put an agent in wave ${block.wave}`
											: `Resolve: staff wave ${block.wave}`
									}
								/>
							) : (
								<Link
									to="/playbooks/$missionType"
									params={{ missionType }}
									data-testid="loadout-resolve-playbook"
									className="inline-flex items-center gap-1 type-caption text-accent-text underline-offset-4 hover:underline"
								>
									Resolve in the playbook
									<ArrowRight aria-hidden="true" className="size-3" />
								</Link>
							)}
						</span>
					) : null}
				</li>
			) : null}
			{warnings.map((warning) => (
				<li
					key={warning.code}
					data-testid={`loadout-warning-${warning.code}`}
					className="flex flex-col gap-1.5 rounded-sm border border-gate-warn-line bg-gate-warn-soft p-2"
				>
					<span className="flex items-start gap-2 type-small text-foreground">
						<StatusGlyph tone="warn" className="mt-1" />
						<span>{warningCopy(warning)}</span>
					</span>
					{resolvable ? (
						<span className="flex flex-wrap gap-x-3 pl-4">
							{warning.missing.map((gap) => (
								<ResolveLink
									key={gap}
									missionId={missionId}
									focus={gapTarget(gap, roster)}
									label={`Resolve: assign ${gap}`}
								/>
							))}
						</span>
					) : null}
				</li>
			))}
			{!block && warnings.length === 0 ? (
				<li
					data-testid="loadout-clear"
					className="flex items-center gap-2 type-small text-foreground"
				>
					<StatusGlyph tone="pass" />
					Coherent: the first wave is staffed, with no warnings.
				</li>
			) : null}
		</ul>
	);
}
