import { Link, useNavigate } from "@tanstack/react-router";
import type {
	SkillListItem,
	SkillSource,
	SkillSourceKind,
} from "avel-server/contract";
import { BookOpen, ExternalLink, Pencil, Plus, SearchX } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import type { ApiError } from "@/lib/api";
import { isNotFound, loadedRows, useSkillSources } from "@/lib/api/catalog";
import {
	type CreateSkillSourceBody,
	type UpdateSkillSourceBody,
	useCreateSkillSource,
	useRemoveSkillSource,
	useSkillSource,
	useUpdateSkillSource,
} from "@/lib/api/skills";
import { cn } from "@/lib/utils";
import { ActionModal, type FieldIssue, ModalField } from "./action-modal";
import {
	CatalogField,
	CatalogListSkeleton,
	SkillStatusPill,
} from "./catalog-sample";
import { Segments } from "./catalog-skill-editor";
import { EmptyState } from "./empty-state";
import { SectionPanel } from "./section-panel";
import { ErrorState, type ErrorStateProps, Surface } from "./surface";
import { useOpenGeneration } from "./use-open-generation";
import { fieldChanges, WhatChanges } from "./what-changes";

/*
 * Sources, a view of Catalog → Skills: where skills come from (GET
 * /api/skill-sources). Each source is a card on a board grouped by kind;
 * choosing one opens it (GET /api/skill-sources/:id) with the skills that
 * name it, and there it is edited or removed. A source is removed softly,
 * and only while no live skill names it: a retired skill is still live, so
 * it holds its source too (422 skill_source_in_use).
 */

const KINDS: { value: SkillSourceKind; label: string; meaning: string }[] = [
	{
		value: "internal",
		label: "Yours",
		meaning: "Written by you, inside AVEL.",
	},
	{
		value: "vendor",
		label: "Vendor",
		meaning: "Published by a framework or tool's maker.",
	},
	{
		value: "community",
		label: "Community",
		meaning: "Shared openly by other teams.",
	},
];

export type SourceGroup = {
	kind: SkillSourceKind;
	label: string;
	sources: SkillSource[];
};

/** The sources by kind, Yours first, each by name; empty kinds are left out. */
export function sourceGroups(sources: readonly SkillSource[]): SourceGroup[] {
	return KINDS.map(({ value, label }) => ({
		kind: value,
		label,
		sources: sources
			.filter((source) => source.kind === value)
			.sort((a, b) => a.name.localeCompare(b.name)),
	})).filter((group) => group.sources.length > 0);
}

/** "1 skill", "3 skills". */
export function skillCountLabel(count: number): string {
	return count === 1 ? "1 skill" : `${count} skills`;
}

/** A URL's host, for a card; the text itself when it does not parse. */
export function hostOf(url: string): string {
	try {
		return new URL(url).host;
	} catch {
		return url;
	}
}

/**
 * Why Remove is held. The server refuses while any live skill names the
 * source, and a retired skill is live: it can be neither edited nor
 * deleted, so a source holding one stays.
 */
export function removeBlocker(
	source: Pick<SkillSource, "skillCount">,
): string | undefined {
	if (source.skillCount === 0) return undefined;
	return `${skillCountLabel(source.skillCount)} still ${source.skillCount === 1 ? "comes" : "come"} from this source. Move each to another source in its editor first.`;
}

// ---------------------------------------------------------------------------
// The form's draft.

export type SourceDraft = {
	name: string;
	kind: SkillSourceKind;
	url: string;
	license: string;
};

export function sourceDraftOf(source?: SkillSource): SourceDraft {
	return {
		name: source?.name ?? "",
		kind: source?.kind ?? "internal",
		url: source?.url ?? "",
		license: source?.license ?? "",
	};
}

const textOrNull = (text: string) => (text.trim() === "" ? null : text.trim());

/** POST /api/skill-sources's body; empty url and license are left out. */
export function createSourceBodyOf(draft: SourceDraft): CreateSkillSourceBody {
	const url = textOrNull(draft.url);
	const license = textOrNull(draft.license);
	return {
		name: draft.name.trim(),
		kind: draft.kind,
		...(url === null ? {} : { url }),
		...(license === null ? {} : { license }),
	};
}

/** PATCH's body: the fields that differ, cleared ones as null; null when none. */
export function sourcePatchOf(
	source: SkillSource,
	draft: SourceDraft,
): UpdateSkillSourceBody | null {
	const patch: UpdateSkillSourceBody = {};
	const name = draft.name.trim();
	if (name !== source.name) patch.name = name;
	if (draft.kind !== source.kind) patch.kind = draft.kind;
	const url = textOrNull(draft.url);
	if (url !== source.url) patch.url = url;
	const license = textOrNull(draft.license);
	if (license !== source.license) patch.license = license;
	return Object.keys(patch).length === 0 ? null : patch;
}

/** Copy per refused field. The validator's message is for logs. */
const SOURCE_FIELD_COPY: Record<string, string> = {
	name: "Give it a name of 1 to 200 characters.",
	kind: "Choose a kind.",
	url: "A full address, starting with https://, or leave it empty.",
	license: "Up to 200 characters, or leave it empty.",
};

const sourceIssueCopy = (issue: FieldIssue) =>
	SOURCE_FIELD_COPY[String(issue.path[0])] ?? "A value here isn't accepted.";

// ---------------------------------------------------------------------------
// The view.

export function SkillSources({
	selected,
	skills,
}: {
	/** The chosen source's id, from the URL. */
	selected: string | undefined;
	/** The skills loaded so far, to list the ones each source holds. */
	skills: readonly SkillListItem[];
}) {
	const sources = useSkillSources();
	const [adding, setAdding] = useState(false);
	return (
		<section
			aria-labelledby="sources-title"
			data-testid="skill-sources"
			className="flex flex-col gap-4 pb-6"
		>
			<header className="flex flex-wrap items-start gap-3">
				<div className="flex min-w-0 flex-1 flex-col gap-1">
					<h2 id="sources-title" className="type-page text-foreground">
						Sources
					</h2>
					<p className="type-body text-text-muted">
						Where skills come from. Every skill names one, and a source is
						removed only once no skill names it.
					</p>
				</div>
				<Button
					size="sm"
					data-testid="skill-sources-add"
					onClick={() => setAdding(true)}
				>
					<Plus aria-hidden="true" />
					Add source
				</Button>
			</header>
			{selected ? (
				<SourceDetail key={selected} id={selected} skills={skills} />
			) : null}
			<Surface
				data-testid="skill-sources-surface"
				query={sources}
				isEmpty={(data) => loadedRows(data).length === 0}
				loading={<CatalogListSkeleton data-testid="skill-sources-skeleton" />}
				empty={
					<EmptyState
						data-testid="skill-sources-empty"
						compact
						icon={BookOpen}
						title="No sources yet"
						description="Add one before writing a skill: Yours for what you write here, or the vendor or community that published it."
						action={
							<Button
								size="sm"
								variant="outline"
								data-testid="skill-sources-empty-add"
								onClick={() => setAdding(true)}
							>
								<Plus aria-hidden="true" />
								Add source
							</Button>
						}
					/>
				}
				error={ErrorState}
			>
				{(data) => (
					<SourceBoard sources={loadedRows(data)} selected={selected} />
				)}
			</Surface>
			<SourceFormModal open={adding} onOpenChange={setAdding} />
		</section>
	);
}

/**
 * The sources as cards, grouped by kind. A card is a link, so a choice is a
 * URL; the router marks the chosen one aria-current.
 */
export function SourceBoard({
	sources,
	selected,
}: {
	sources: readonly SkillSource[];
	selected: string | undefined;
}) {
	return (
		<div data-testid="skill-sources-board" className="flex flex-col gap-4">
			{sourceGroups(sources).map((group) => (
				<section
					key={group.kind}
					aria-label={group.label}
					data-testid={`skill-sources-kind-${group.kind}`}
					className="flex flex-col gap-2"
				>
					<h3 className="flex items-baseline gap-1.5 px-1 type-caption text-text-subtle">
						<span className="font-medium text-text-muted">{group.label}</span>
						<span className="tabular-nums">{group.sources.length}</span>
					</h3>
					<ul className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-3">
						{group.sources.map((source) => (
							<li key={source.id}>
								<SourceCard source={source} selected={source.id === selected} />
							</li>
						))}
					</ul>
				</section>
			))}
		</div>
	);
}

function SourceCard({
	source,
	selected,
}: {
	source: SkillSource;
	selected: boolean;
}) {
	return (
		<Link
			to="/catalog/skills"
			search={{ view: "sources", source: source.id }}
			data-testid={`skill-source-${source.id}`}
			data-kind={source.kind}
			data-selected={selected || undefined}
			className={cn(
				"focus-inset flex h-full flex-col gap-1.5 rounded-card border p-3 shadow-card transition-colors duration-(--duration-micro) ease-avel",
				selected
					? "border-selected-border bg-selected"
					: "border-border bg-app-panel hover:border-border-strong hover:bg-app-raised",
			)}
		>
			<span className="flex items-center gap-2">
				<span className="type-small min-w-0 flex-1 truncate font-medium text-foreground">
					{source.name}
				</span>
				<Badge variant="outline">{source.kind}</Badge>
			</span>
			<span className="type-mono truncate text-text-subtle">
				{source.url ? hostOf(source.url) : "No address"}
			</span>
			<span className="flex items-center justify-between gap-2 type-caption text-text-muted">
				<span data-testid={`skill-source-${source.id}-count`}>
					{skillCountLabel(source.skillCount)}
				</span>
				<span>{source.license ?? "No license given"}</span>
			</span>
		</Link>
	);
}

/**
 * One source, read by its id so the count is current: its facts, the skills
 * that name it, and Edit and Remove. A removed source answers NOT_FOUND,
 * which is a stale link, said in words.
 */
export function SourceDetail({
	id,
	skills,
}: {
	id: string;
	skills: readonly SkillListItem[];
}) {
	const query = useSkillSource(id);
	const failed = ({ error, retry, retrying }: ErrorStateProps<ApiError>) =>
		isNotFound(error) ? (
			<EmptyState
				data-testid="skill-source-not-found"
				compact
				icon={SearchX}
				title="This source is gone"
				description="It was removed, or the link is old. Choose one from the board."
			/>
		) : (
			<ErrorState error={error} retry={retry} retrying={retrying} />
		);
	return (
		<Surface
			data-testid="skill-source-detail-surface"
			query={query}
			isEmpty={() => false}
			loading={
				<Skeleton
					data-testid="skill-source-detail-skeleton"
					className="h-40 w-full rounded-card"
				/>
			}
			empty={null}
			error={failed}
		>
			{(source) => (
				<SourcePanel
					source={source}
					skills={skills.filter((skill) => skill.source.id === source.id)}
				/>
			)}
		</Surface>
	);
}

export function SourcePanel({
	source,
	skills,
}: {
	source: SkillSource;
	skills: readonly SkillListItem[];
}) {
	const [open, setOpen] = useState<"edit" | "remove" | null>(null);
	const meaning = KINDS.find((kind) => kind.value === source.kind)?.meaning;
	return (
		<SectionPanel
			title={source.name}
			data-testid="skill-source-detail"
			actions={
				<div className="flex items-center gap-2">
					<Button
						size="sm"
						variant="outline"
						data-testid="skill-source-edit"
						onClick={() => setOpen("edit")}
					>
						<Pencil aria-hidden="true" />
						Edit
					</Button>
					<Button
						size="sm"
						variant="destructive"
						data-testid="skill-source-remove"
						onClick={() => setOpen("remove")}
					>
						Remove
					</Button>
				</div>
			}
		>
			<div className="flex flex-col gap-3">
				<dl className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-x-6 gap-y-3">
					<CatalogField label="Kind">
						<span className="type-mono">{source.kind}</span>
						{meaning ? (
							<span className="block type-caption text-text-subtle">
								{meaning}
							</span>
						) : null}
					</CatalogField>
					<CatalogField label="Address">
						{source.url ? (
							<a
								href={source.url}
								target="_blank"
								rel="noreferrer"
								data-testid="skill-source-url"
								className="inline-flex max-w-full items-center gap-1 text-accent-text underline-offset-4 hover:underline"
							>
								<span className="truncate">{hostOf(source.url)}</span>
								<ExternalLink aria-hidden="true" className="size-3.5" />
							</a>
						) : (
							<span className="text-text-subtle">None</span>
						)}
					</CatalogField>
					<CatalogField label="License">
						{source.license ?? (
							<span className="text-text-subtle">None given</span>
						)}
					</CatalogField>
					<CatalogField label="Skills">
						<span data-testid="skill-source-count" className="tabular-nums">
							{skillCountLabel(source.skillCount)}
						</span>
					</CatalogField>
				</dl>
				{skills.length > 0 ? (
					<ul
						aria-label={`Skills from ${source.name}`}
						data-testid="skill-source-skills"
						className="flex flex-col gap-1"
					>
						{skills.map((skill) => (
							<li key={skill.id} className="flex items-center gap-2">
								<Link
									to="/catalog/skills"
									search={{ skill: skill.slug }}
									data-testid={`skill-source-skill-${skill.slug}`}
									className="type-small min-w-0 flex-1 truncate text-accent-text underline-offset-4 hover:underline"
								>
									{skill.name}
								</Link>
								<SkillStatusPill status={skill.status} />
							</li>
						))}
					</ul>
				) : null}
			</div>
			<SourceFormModal
				source={source}
				open={open === "edit"}
				onOpenChange={(next) => setOpen(next ? "edit" : null)}
			/>
			<SourceRemoveModal
				source={source}
				skills={skills}
				open={open === "remove"}
				onOpenChange={(next) => setOpen(next ? "remove" : null)}
			/>
		</SectionPanel>
	);
}

// ---------------------------------------------------------------------------
// Writing a source.

/**
 * Add source and Edit source, a Form modal (ruling 35). A new source opens
 * on the board once saved.
 */
export function SourceFormModal({
	open,
	onOpenChange,
	source,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/** Present when editing; absent when adding. */
	source?: SkillSource;
}) {
	const create = useCreateSkillSource();
	const update = useUpdateSkillSource();
	const mutation = source ? update : create;
	const navigate = useNavigate();
	// Each opening starts from the source's current values.
	const generation = useOpenGeneration(open);
	return (
		<SourceForm
			key={`${source?.id ?? "new"}:${generation}`}
			open={open}
			onOpenChange={(next) => {
				if (!next) mutation.reset();
				onOpenChange(next);
			}}
			source={source}
			pending={mutation.isPending}
			error={mutation.error}
			onSubmit={(draft) => {
				if (source) {
					const patch = sourcePatchOf(source, draft);
					if (patch === null) return;
					update.mutate(
						{ id: source.id, patch },
						{
							onSuccess: (saved) => {
								toast.success(`Saved ${saved.name}.`);
								onOpenChange(false);
							},
						},
					);
				} else {
					create.mutate(createSourceBodyOf(draft), {
						onSuccess: (saved) => {
							toast.success(`Added ${saved.name}.`);
							onOpenChange(false);
							navigate({
								to: "/catalog/skills",
								search: { view: "sources", source: saved.id },
							});
						},
					});
				}
			}}
		/>
	);
}

/** The form in its modal: it holds the draft and reports a submit. */
export function SourceForm({
	open = true,
	onOpenChange = () => {},
	source,
	pending,
	error,
	onSubmit,
}: {
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	source?: SkillSource;
	pending: boolean;
	error: ApiError | null;
	onSubmit: (draft: SourceDraft) => void;
}) {
	const [draft, setDraft] = useState<SourceDraft>(() => sourceDraftOf(source));
	const changes = fieldChanges(
		source ? sourceDraftOf(source) : undefined,
		draft,
		[
			{ key: "name", label: "Name" },
			{ key: "kind", label: "Kind", mono: true },
			{ key: "url", label: "Address", mono: true },
			{ key: "license", label: "License" },
		],
	);
	const unchanged =
		source !== undefined && sourcePatchOf(source, draft) === null;
	const set = <K extends keyof SourceDraft>(key: K, value: SourceDraft[K]) => {
		setDraft((current) => ({ ...current, [key]: value }));
	};
	return (
		<ActionModal
			open={open}
			onOpenChange={onOpenChange}
			size="form"
			title={source ? `Edit ${source.name}` : "Add source"}
			description={
				source
					? "Every skill from this source shows the new name and kind."
					: "Where skills come from. A skill names its source when it is written."
			}
			dirty={changes.length > 0}
			submitLabel={source ? "Save source" : "Add source"}
			pendingLabel={source ? "Saving" : "Adding"}
			// What is missing shows on the button before it is pressed.
			submitDisabledReason={
				unchanged
					? "Nothing has changed yet."
					: draft.name.trim() === ""
						? "Give the source a name."
						: undefined
			}
			onSubmit={() => onSubmit(draft)}
			pending={pending}
			error={error}
			describeIssue={sourceIssueCopy}
			changes={
				source ? (
					<WhatChanges changes={changes} data-testid="source-form-changes" />
				) : undefined
			}
			data-testid="source-form"
		>
			<ModalField name="name" label="Name" testid="source-form-name">
				{(props) => (
					<Input
						{...props}
						maxLength={200}
						placeholder="Framework vendor pack"
						value={draft.name}
						onChange={(event) => set("name", event.target.value)}
					/>
				)}
			</ModalField>
			<Segments
				legend="Kind"
				options={KINDS}
				value={draft.kind}
				onChange={(kind) => set("kind", kind)}
				data-testid="source-form-kind"
			/>
			<ModalField
				name="url"
				label="Address"
				hint="Optional"
				testid="source-form-url"
			>
				{(props) => (
					<Input
						{...props}
						type="url"
						maxLength={2000}
						className="type-mono"
						placeholder="https://"
						value={draft.url}
						onChange={(event) => set("url", event.target.value)}
					/>
				)}
			</ModalField>
			<ModalField
				name="license"
				label="License"
				hint="Optional"
				testid="source-form-license"
			>
				{(props) => (
					<Input
						{...props}
						maxLength={200}
						placeholder="MIT"
						value={draft.license}
						onChange={(event) => set("license", event.target.value)}
					/>
				)}
			</ModalField>
		</ActionModal>
	);
}

/**
 * Remove, a Confirm modal. Held, with its reason, while skills name the
 * source; if the server refuses anyway (a skill was just written from it),
 * its refusal says why, under the same words.
 */
export function SourceRemoveModal({
	source,
	skills,
	open,
	onOpenChange,
}: {
	source: SkillSource;
	skills: readonly SkillListItem[];
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const remove = useRemoveSkillSource();
	const navigate = useNavigate();
	const blocker = removeBlocker(source);
	const retired = skills.filter((skill) => skill.status === "retired");
	return (
		<ActionModal
			open={open}
			onOpenChange={(next) => {
				if (!next) remove.reset();
				onOpenChange(next);
			}}
			size="confirm"
			title={`Remove ${source.name}`}
			description={
				blocker
					? "A source is removed only once no skill names it."
					: "It leaves the catalog, and no new skill can name it. Its history in the activity stays."
			}
			dirty={false}
			submitLabel="Remove source"
			pendingLabel="Removing"
			submitDisabledReason={blocker}
			destructive
			pending={remove.isPending}
			error={remove.error}
			onSubmit={() =>
				remove.mutate(source.id, {
					onSuccess: () => {
						toast.success(`Removed ${source.name}.`);
						onOpenChange(false);
						navigate({ to: "/catalog/skills", search: { view: "sources" } });
					},
				})
			}
			data-testid="source-remove-modal"
		>
			{blocker ? (
				<div
					data-testid="source-remove-in-use"
					className="flex flex-col gap-2 rounded-control border border-border bg-app-well p-3"
				>
					<p className="type-small text-foreground">{blocker}</p>
					{retired.length > 0 ? (
						<p
							data-testid="source-remove-retired"
							className="type-small text-text-muted"
						>
							{`A retired skill can't be edited, so it can't be moved. While ${retired.length === 1 ? "one is" : `${retired.length} are`} here, this source stays.`}
						</p>
					) : null}
					{skills.length > 0 ? (
						<ul className="flex flex-col gap-1">
							{skills.map((skill) => (
								<li key={skill.id} className="flex items-center gap-2">
									<Link
										to="/catalog/skills"
										// A retired skill can't be edited, so it opens read-only.
										search={
											skill.status === "retired"
												? { skill: skill.slug }
												: { skill: skill.slug, view: "edit" }
										}
										data-testid={`source-remove-skill-${skill.slug}`}
										className="type-small min-w-0 flex-1 truncate text-accent-text underline-offset-4 hover:underline"
									>
										{skill.name}
									</Link>
									<SkillStatusPill status={skill.status} />
								</li>
							))}
						</ul>
					) : null}
				</div>
			) : null}
		</ActionModal>
	);
}
