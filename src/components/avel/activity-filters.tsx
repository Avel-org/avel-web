import {
	type ActivityActorKind,
	type ActivityEntityType,
	activityEntityType,
} from "avel-server/contract";
import { useId } from "react";
import { Button } from "@/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { tabsListVariants } from "@/components/ui/tabs";
import type { ActivityFilters } from "@/lib/api/activity";
import { cn } from "@/lib/utils";
import { ENTITY_LABEL } from "./activity-copy";

// Radix Select takes no empty value, so "all" stands for an unset filter.
const ALL = "all";

/**
 * Who acted, as the filter names them. "You" is the operator: the console
 * has one, the person signed in. A new actor kind in the contract fails the
 * build here until it has a name.
 */
export const ACTOR_SEGMENT = {
	operator: "You",
	agent: "Agents",
	system: "Runner",
	canon: "Canon",
} as const satisfies Record<ActivityActorKind, string>;

/**
 * The entities with segments of their own: the ones the log is mostly
 * about. The contract has about twenty, too many for one segmented row; the
 * rest sit under More, so every value the contract takes stays reachable.
 */
export const COMMON_ENTITIES = [
	"mission",
	"client",
	"engagement",
	"roster_entry",
	"dispatch",
] as const satisfies readonly ActivityEntityType[];

const isCommon = (value: ActivityEntityType | undefined) =>
	value !== undefined &&
	(COMMON_ENTITIES as readonly ActivityEntityType[]).includes(value);

/**
 * The two filters the contract takes on this page, each single-valued:
 * entity type and actor kind, as v3 segmented controls (.segmented). The
 * options are the contract's own enums, so a new value appears here with its
 * label (which the copy tables require).
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
			<Segmented
				legend="Entity"
				testId="activity-filter-entity"
				value={isCommon(filters.entityType) ? filters.entityType : undefined}
				allPressed={filters.entityType === undefined}
				options={COMMON_ENTITIES.map((value) => ({
					value,
					label: ENTITY_LABEL[value],
				}))}
				onChange={(entityType) =>
					onChange({
						...filters,
						entityType: entityType as ActivityEntityType | undefined,
					})
				}
			>
				<MoreEntities
					value={isCommon(filters.entityType) ? undefined : filters.entityType}
					onChange={(entityType) => onChange({ ...filters, entityType })}
				/>
			</Segmented>
			<Segmented
				legend="Actor"
				testId="activity-filter-actor"
				value={filters.actorKind}
				// In the segment map's order, people first: You, Agents, Runner,
				// Canon. The map covers every kind the contract has.
				options={(Object.keys(ACTOR_SEGMENT) as ActivityActorKind[]).map(
					(value) => ({ value, label: ACTOR_SEGMENT[value] }),
				)}
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

/** One segmented row: All, then each option, the chosen one pressed. */
function Segmented({
	legend,
	testId,
	value,
	allPressed = value === undefined,
	options,
	onChange,
	children,
}: {
	legend: string;
	testId: string;
	/** All is pressed: nothing chosen, here or under More. */
	allPressed?: boolean;
	/** Unset when All is chosen, or when the choice lives under More. */
	value: string | undefined;
	options: { value: string; label: string }[];
	onChange: (value: string | undefined) => void;
	children?: React.ReactNode;
}) {
	return (
		<fieldset
			data-testid={testId}
			className={cn(tabsListVariants({ variant: "default" }), "flex-wrap")}
		>
			<legend className="sr-only">{legend}</legend>
			{[{ value: ALL, label: "All" }, ...options].map((option) => {
				const pressed =
					option.value === ALL ? allPressed : option.value === value;
				return (
					<Button
						key={option.value}
						type="button"
						variant="segment"
						aria-pressed={pressed}
						data-testid={`${testId}-${option.value}`}
						onClick={() =>
							onChange(option.value === ALL ? undefined : option.value)
						}
					>
						{option.label}
					</Button>
				);
			})}
			{children}
		</fieldset>
	);
}

/**
 * The rest of the entities, at the end of the entity row. It reads "More"
 * until one of them is chosen, then names it, pressed as a segment is.
 */
function MoreEntities({
	value,
	onChange,
}: {
	/** Set only when the chosen entity is one of these. */
	value: ActivityEntityType | undefined;
	onChange: (value: ActivityEntityType | undefined) => void;
}) {
	const id = useId();
	const rest = activityEntityType.options.filter((v) => !isCommon(v));
	return (
		<>
			<label htmlFor={id} className="sr-only">
				More entities
			</label>
			<Select
				value={value ?? ALL}
				onValueChange={(next) =>
					onChange(next === ALL ? undefined : (next as ActivityEntityType))
				}
			>
				<SelectTrigger
					id={id}
					size="sm"
					data-testid="activity-filter-entity-more"
					aria-pressed={value !== undefined}
					className={cn(
						"h-7 border-transparent bg-transparent shadow-none",
						value !== undefined && "bg-chip text-text",
					)}
				>
					<SelectValue>{value ? ENTITY_LABEL[value] : "More"}</SelectValue>
				</SelectTrigger>
				<SelectContent>
					<SelectItem value={ALL}>Any of these</SelectItem>
					{rest.map((entity) => (
						<SelectItem key={entity} value={entity}>
							{ENTITY_LABEL[entity]}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</>
	);
}
