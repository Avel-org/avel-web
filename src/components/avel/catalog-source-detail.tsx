import { Link } from "@tanstack/react-router";
import type {
	SkillLayer,
	SkillListItem,
	SkillSource,
	SkillStatus,
} from "avel-server/contract";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { loadedRows, useSourceSkills } from "@/lib/api/catalog";
import { DetailModal } from "./action-modal";
import { SOURCE_KIND_LABEL } from "./catalog-source-form";
import { HoverCard } from "./hover-card";
import { ErrorState, Surface } from "./surface";

const LAYERS: readonly SkillLayer[] = ["role", "stack", "domain"];
const STATUSES: readonly SkillStatus[] = ["approved", "draft", "retired"];

/** Skills kept by the layer and status filters; undefined means any. */
export function filterSkills(
	skills: readonly SkillListItem[],
	layer: SkillLayer | undefined,
	status: SkillStatus | undefined,
): SkillListItem[] {
	return skills.filter(
		(s) =>
			(layer === undefined || s.layer === layer) &&
			(status === undefined || s.status === status),
	);
}

/**
 * A source's skills, centred (ruling 35: a DetailModal). Each skill is a
 * chip linking to it in Skills, with a preview on hover or focus. Layer and
 * status filter the chips.
 */
export function SourceDetailModal({
	source,
	open,
	onOpenChange,
}: {
	/** Held while closing, so the closing animation shows the same source. */
	source: SkillSource | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	if (source === null) return null;
	return (
		<DetailModal
			open={open}
			onOpenChange={onOpenChange}
			size="stepper"
			title={source.name}
			description={`${SOURCE_KIND_LABEL[source.kind]} · ${source.skillCount === 1 ? "1 skill" : `${source.skillCount} skills`}`}
			data-testid="source-detail"
		>
			<SourceSkills source={source} />
		</DetailModal>
	);
}

export function SourceSkills({ source }: { source: SkillSource }) {
	const query = useSourceSkills(source.id);
	const [layer, setLayer] = useState<SkillLayer | undefined>(undefined);
	const [status, setStatus] = useState<SkillStatus | undefined>(undefined);
	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-wrap items-center gap-4">
				<Filter
					legend="Layer"
					testid="source-detail-layer"
					values={LAYERS}
					value={layer}
					onChange={setLayer}
				/>
				<Filter
					legend="Status"
					testid="source-detail-status"
					values={STATUSES}
					value={status}
					onChange={setStatus}
				/>
			</div>
			<Surface
				data-testid="source-detail-skills"
				query={query}
				isEmpty={(data) => loadedRows(data).length === 0}
				loading={<Skeleton className="h-8 w-full" />}
				empty={
					<p className="type-small text-text-muted">
						No skills come from this source yet.
					</p>
				}
				error={ErrorState}
			>
				{(data) => {
					const shown = filterSkills(loadedRows(data), layer, status);
					return shown.length === 0 ? (
						<p
							data-testid="source-detail-none-match"
							className="type-small text-text-muted"
						>
							No skills match these filters.
						</p>
					) : (
						<ul className="flex flex-wrap gap-1.5 stagger-in">
							{shown.map((skill) => (
								<li key={skill.id}>
									<SkillChip skill={skill} />
								</li>
							))}
						</ul>
					);
				}}
			</Surface>
		</div>
	);
}

function SkillChip({ skill }: { skill: SkillListItem }) {
	return (
		<HoverCard
			data-testid={`source-skill-preview-${skill.slug}`}
			trigger={
				<Link
					to="/catalog/skills"
					search={{ skill: skill.slug }}
					data-testid={`source-skill-${skill.slug}`}
					className="type-small inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-foreground transition-colors duration-(--duration-micro) ease-avel hover:bg-state-hover"
				>
					{skill.name}
					<span className="type-mono-small text-text-subtle">
						{skill.layer}
					</span>
				</Link>
			}
		>
			<div className="flex flex-col gap-1">
				<p className="type-small font-medium text-foreground">{skill.name}</p>
				<p className="type-mono-small text-text-subtle">{skill.slug}</p>
				<p className="type-caption line-clamp-3 text-text-muted">
					{skill.description}
				</p>
				<p className="type-caption text-text-subtle">
					{`${skill.layer} · ${skill.status} · v${skill.version}`}
					{skill.reviewedAt === null ? " · no reviewer" : ""}
				</p>
			</div>
		</HoverCard>
	);
}

function Filter<V extends string>({
	legend,
	testid,
	values,
	value,
	onChange,
}: {
	legend: string;
	testid: string;
	values: readonly V[];
	value: V | undefined;
	onChange: (value: V | undefined) => void;
}) {
	return (
		<fieldset data-testid={testid} className="flex items-center gap-1">
			<legend className="sr-only">{legend}</legend>
			<span className="type-caption mr-1 text-text-subtle">{legend}</span>
			{[undefined, ...values].map((v) => (
				<Button
					key={v ?? "any"}
					size="sm"
					variant="ghost"
					aria-pressed={value === v}
					data-testid={`${testid}-${v ?? "any"}`}
					onClick={() => onChange(v)}
					className="aria-pressed:bg-state-selected"
				>
					{v ?? "Any"}
				</Button>
			))}
		</fieldset>
	);
}
