import {
	type ActivityActorKind,
	type ActivityEntityType,
	activityActorKind,
	activityEntityType,
} from "avel-server/contract";
import { useId } from "react";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import type { ActivityFilters } from "@/lib/api/activity";
import { ACTOR_KIND_LABEL, ENTITY_LABEL } from "./activity-copy";

// Radix Select takes no empty value, so "all" stands for an unset filter.
const ALL = "all";

/**
 * The two filters the contract takes on this page, each single-valued:
 * entity type and actor kind. The options are the contract's own enums, so a
 * new value appears here with its label (which the copy tables require).
 */
export function ActivityFilterBar({
	filters,
	onChange,
}: {
	filters: ActivityFilters;
	onChange: (next: ActivityFilters) => void;
}) {
	return (
		<div
			data-testid="activity-filters"
			className="flex flex-wrap items-center gap-2"
		>
			<FilterSelect
				label="Entity"
				testId="activity-filter-entity"
				value={filters.entityType}
				options={activityEntityType.options.map((value) => ({
					value,
					label: ENTITY_LABEL[value],
				}))}
				allLabel="All entities"
				onChange={(entityType) =>
					onChange({
						...filters,
						entityType: entityType as ActivityEntityType | undefined,
					})
				}
			/>
			<FilterSelect
				label="Actor"
				testId="activity-filter-actor"
				value={filters.actorKind}
				options={activityActorKind.options.map((value) => ({
					value,
					label: ACTOR_KIND_LABEL[value],
				}))}
				allLabel="All actors"
				onChange={(actorKind) =>
					onChange({
						...filters,
						actorKind: actorKind as ActivityActorKind | undefined,
					})
				}
			/>
		</div>
	);
}

/**
 * What a filter's trigger says: "All entities" when unset, "Entity: User"
 * when set, so a chosen value never stands alone ("User" next to "Agent"
 * says neither which filter is which).
 */
export function triggerText(
	label: string,
	options: { value: string; label: string }[],
	value: string | undefined,
	allLabel: string,
): string {
	const chosen = options.find((option) => option.value === value);
	return chosen ? `${label}: ${chosen.label}` : allLabel;
}

function FilterSelect({
	label,
	testId,
	value,
	options,
	allLabel,
	onChange,
}: {
	label: string;
	testId: string;
	value: string | undefined;
	options: { value: string; label: string }[];
	allLabel: string;
	onChange: (value: string | undefined) => void;
}) {
	const id = useId();
	return (
		<div className="flex items-center gap-2">
			<label htmlFor={id} className="sr-only">
				{label}
			</label>
			<Select
				value={value ?? ALL}
				onValueChange={(next) => onChange(next === ALL ? undefined : next)}
			>
				{/* One fixed width for every choice, so picking one never moves
				    the select beside it. */}
				<SelectTrigger id={id} size="sm" data-testid={testId} className="w-48">
					{/* Named here, so the choice reads before the list ever opens,
					    and says which filter it is once one is chosen. */}
					<SelectValue>
						{triggerText(label, options, value, allLabel)}
					</SelectValue>
				</SelectTrigger>
				<SelectContent>
					<SelectItem value={ALL}>{allLabel}</SelectItem>
					{options.map((option) => (
						<SelectItem key={option.value} value={option.value}>
							{option.label}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</div>
	);
}
