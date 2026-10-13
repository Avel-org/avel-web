import { useQueries, useQuery } from "@tanstack/react-query";
import {
	type AgentTemplate,
	type CoherenceBlock,
	type CoherenceInput,
	type CoherenceResult,
	type CoherenceWarning,
	computeCoherence,
	type MissionDetail,
	type Playbook,
} from "avel-server/contract";
import { Skeleton } from "@/components/ui/skeleton";
import { useApiClient } from "@/lib/api";
import {
	coherenceInputFor,
	inheritedTemplateIds,
	rosterQuery,
	templateQuery,
} from "@/lib/api/coherence";
import type { ApiError } from "@/lib/api/errors";
import { usePlaybook } from "@/lib/api/playbooks";
import { StatusGlyph } from "./status-pill";
import { ErrorState, Surface, type SurfaceQuery } from "./surface";

/*
 * Coherence for one mission against its playbook. The verdict is the
 * contract's computeCoherence, the same code the export gate runs, so this
 * panel shows exactly what the gate will decide. Copy is keyed on the
 * result's codes; the result's `reason` strings are for logs, never parsed
 * or shown.
 */

/** The block, in words. A null wave means the playbook declares none. */
export function blockCopy(block: CoherenceBlock): string {
	return block.wave === null
		? "This playbook declares no waves, so no wave can start. The export gate refuses every mission of this type until the playbook declares one."
		: `No active agent is in wave ${block.wave}, the first wave this playbook runs. The export gate refuses this mission until one is.`;
}

const MISSING_ROLE = {
	foundations: "the foundations role",
	verification: "a verification role",
} as const satisfies Record<
	Extract<
		CoherenceWarning,
		{ code: "vertical_cut_roles_unassigned" }
	>["missing"][number],
	string
>;

/** Each warning in words, keyed on the contract's warning codes. */
export const WARNING_COPY = {
	vertical_cut_roles_unassigned: (warning) =>
		`When the team is cut by feature, no active agent holds ${warning.missing
			.map((role) => MISSING_ROLE[role])
			.join(" or ")}.`,
} as const satisfies {
	[Code in CoherenceWarning["code"]]: (
		warning: Extract<CoherenceWarning, { code: Code }>,
	) => string;
};

export function warningCopy(warning: CoherenceWarning): string {
	return WARNING_COPY[warning.code](warning);
}

/**
 * The mission's CoherenceInput as one query state for <Surface>: loading
 * until the roster and every template it inherits paths from are in, and
 * the first error if a read failed.
 */
export function useCoherenceInput(
	mission: Pick<MissionDetail, "id" | "cut">,
): SurfaceQuery<CoherenceInput, ApiError> {
	const api = useApiClient();
	const roster = useQuery(rosterQuery(api, mission.id));
	const ids = roster.data ? inheritedTemplateIds(roster.data) : [];
	const templates = useQueries({
		queries: ids.map((id) => templateQuery(api, id)),
	});

	const failed = [roster, ...templates].find((q) => q.status === "error");
	if (failed?.error) {
		return {
			status: "error",
			error: failed.error,
			refetch: failed.refetch,
			isFetching: failed.isFetching,
		};
	}
	if (roster.status !== "success") return { status: "pending" };
	const loaded = new Map<string, AgentTemplate>();
	for (const template of templates) {
		if (template.data) loaded.set(template.data.id, template.data);
	}
	const input = coherenceInputFor(mission.cut, roster.data, loaded);
	return input ? { status: "success", data: input } : { status: "pending" };
}

/** Both reads coherence needs, as one state: the input, then the playbook. */
export function useCoherence(
	mission: Pick<MissionDetail, "id" | "cut">,
	missionType: string,
): SurfaceQuery<CoherenceResult, ApiError> {
	const input = useCoherenceInput(mission);
	const playbook = usePlaybook(missionType);
	if (input.status === "error") return input;
	if (playbook.status === "error") {
		return {
			status: "error",
			error: playbook.error,
			refetch: playbook.refetch,
			isFetching: playbook.isFetching,
		};
	}
	if (input.status !== "success" || playbook.status !== "success") {
		return { status: "pending" };
	}
	return {
		status: "success",
		data: computeCoherence(input.data, coherencePlaybook(playbook.data)),
	};
}

/** The two fields of a playbook coherence reads. */
const coherencePlaybook = ({ wavesApplicable, gates }: Playbook) => ({
	wavesApplicable,
	gates,
});

export function CoherencePanel({
	mission,
	missionType,
}: {
	mission: Pick<MissionDetail, "id" | "cut">;
	missionType: string;
}) {
	const result = useCoherence(mission, missionType);
	return (
		<Surface
			data-testid="coherence"
			query={result}
			loading={
				<div data-testid="coherence-skeleton" className="flex flex-col gap-2">
					<Skeleton className="h-4 w-56" />
					<Skeleton className="h-4 w-40" />
				</div>
			}
			// A result always says something: clear is a verdict too.
			empty={null}
			isEmpty={() => false}
			error={ErrorState}
		>
			{(data) => <CoherenceView result={data} />}
		</Surface>
	);
}

export function CoherenceView({ result }: { result: CoherenceResult }) {
	const clear = !result.block && result.warnings.length === 0;
	return (
		<ul
			data-testid="coherence-result"
			data-blocked={result.block !== undefined}
			className="flex flex-col gap-2"
		>
			{result.block ? (
				<li
					data-testid="coherence-block"
					data-wave={result.block.wave ?? "none"}
					className="flex items-start gap-2 rounded-sm border border-gate-block-line bg-gate-block-soft p-2 type-small text-foreground"
				>
					<StatusGlyph tone="block" className="mt-1" />
					<span>{blockCopy(result.block)}</span>
				</li>
			) : null}
			{result.warnings.map((warning) => (
				<li
					key={warning.code}
					data-testid={`coherence-warning-${warning.code}`}
					className="flex items-start gap-2 rounded-sm border border-gate-warn-line bg-gate-warn-soft p-2 type-small text-foreground"
				>
					<StatusGlyph tone="warn" className="mt-1" />
					<span>{warningCopy(warning)}</span>
				</li>
			))}
			{clear ? (
				<li
					data-testid="coherence-clear"
					className="flex items-center gap-2 type-small text-foreground"
				>
					<StatusGlyph tone="pass" />
					The roster can run this playbook: its first wave is staffed, with no
					warnings.
				</li>
			) : null}
		</ul>
	);
}
