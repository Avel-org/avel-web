import { Link, useNavigate } from "@tanstack/react-router";
import {
	type CreateSkillBody,
	createSkillBody,
	ROLE_LABELS,
	ROLE_TEAM,
	ROLES,
	type Role,
	type Skill,
	type SkillIoShape,
	type SkillLayer,
	type SkillSource,
	type SkillType,
	TEAM_LABELS,
	TEAMS,
	type UpdateSkillBody,
	updateSkillBody,
} from "avel-server/contract";
import { useId, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { tabsListVariants } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api";
import { loadedRows, useSkillSources } from "@/lib/api/catalog";
import { useCreateSkill, useUpdateSkill } from "@/lib/api/skills";
import { cn } from "@/lib/utils";
import {
	type FieldIssue,
	type IssuePath,
	issuesOf,
	placeIssues,
} from "./action-modal";
import { skillLineTone, skillMarkdown } from "./catalog-skill-inspector";
import { Field, FormError } from "./client-form";
import { CodeView } from "./code-view";
import { fieldChanges, WhatChanges } from "./what-changes";

/*
 * Writing a skill: New skill (POST /api/skills) and Edit (PATCH
 * /api/skills/:id) share one form, in the pane where the inspector sits.
 * A new skill is a draft at version 1. Every save of an existing one bumps
 * its version and recomputes its hash, and a change to a hashed field of an
 * approved skill returns it to draft; the form says which before it is sent.
 * Agents never write skills: an operator does, here.
 */

const IO_SIZES = ["large", "small"] as const;

/** What the form holds. Grants are typed one per line. */
export type SkillDraft = {
	name: string;
	slug: string;
	description: string;
	contentMd: string;
	avelEnhancementMd: string;
	layer: SkillLayer;
	type: SkillType;
	recommendedFor: Role[];
	sourceId: string;
	grants: string;
	reads: SkillIoShape["reads"];
	returns: SkillIoShape["returns"];
};

/** The contract's description cap, shown beside its length. */
export const DESCRIPTION_MAX = 500;

/** A slug from a name: lowercase words joined by single hyphens. */
export function slugOf(name: string): string {
	return name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 100)
		.replace(/-+$/, "");
}

/** The source a new skill starts from: the first internal one, else the first. */
export function defaultSourceId(sources: readonly SkillSource[]): string {
	return (
		sources.find((source) => source.kind === "internal")?.id ??
		sources[0]?.id ??
		""
	);
}

/** A skill as the form holds it; a blank draft without one. */
export function draftOf(skill?: Skill, sourceId = ""): SkillDraft {
	if (!skill) {
		return {
			name: "",
			slug: "",
			description: "",
			contentMd: "",
			avelEnhancementMd: "",
			layer: "role",
			type: "knowledge",
			recommendedFor: [],
			sourceId,
			grants: "",
			reads: "small",
			returns: "small",
		};
	}
	return {
		name: skill.name,
		slug: skill.slug,
		description: skill.description,
		contentMd: skill.contentMd,
		avelEnhancementMd: skill.avelEnhancementMd ?? "",
		layer: skill.layer,
		type: skill.type,
		recommendedFor: [...skill.recommendedFor],
		sourceId: skill.source.id,
		grants: skill.type === "capability" ? skill.grants.join("\n") : "",
		reads: skill.ioShape?.reads ?? "small",
		returns: skill.ioShape?.returns ?? "small",
	};
}

/** The grants typed, one per line, blank lines dropped. */
export function grantsOf(text: string): string[] {
	return text
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line !== "");
}

/** Text that is empty once trimmed is "none", which the contract sends as null. */
const textOrNull = (text: string) => (text.trim() === "" ? null : text);

/** POST /api/skills's body. Additions are left out when there are none. */
export function createBodyOf(draft: SkillDraft): CreateSkillBody {
	const additions = textOrNull(draft.avelEnhancementMd);
	const common = {
		slug: draft.slug.trim(),
		name: draft.name.trim(),
		description: draft.description.trim(),
		contentMd: draft.contentMd,
		...(additions === null ? {} : { avelEnhancementMd: additions }),
		layer: draft.layer,
		recommendedFor: inRoleOrder(draft.recommendedFor),
		sourceId: draft.sourceId,
	};
	return draft.type === "capability"
		? {
				...common,
				type: "capability",
				grants: grantsOf(draft.grants),
				ioShape: { reads: draft.reads, returns: draft.returns },
			}
		: { ...common, type: "knowledge" };
}

const sameList = (a: readonly string[], b: readonly string[]) =>
	a.length === b.length && a.every((item, i) => item === b[i]);

const inRoleOrder = (roles: readonly Role[]): Role[] =>
	ROLES.filter((role) => roles.includes(role));

/**
 * PATCH /api/skills/:id's body: only the fields that differ, or null when
 * none does. Moving to capability sends grants and io shape with it; moving
 * to knowledge sends both as null, as the contract requires.
 */
export function patchOf(
	skill: Skill,
	draft: SkillDraft,
): UpdateSkillBody | null {
	const patch: UpdateSkillBody = {};
	const slug = draft.slug.trim();
	const name = draft.name.trim();
	const description = draft.description.trim();
	if (slug !== skill.slug) patch.slug = slug;
	if (name !== skill.name) patch.name = name;
	if (description !== skill.description) patch.description = description;
	if (draft.contentMd !== skill.contentMd) patch.contentMd = draft.contentMd;
	const additions = textOrNull(draft.avelEnhancementMd);
	if (additions !== skill.avelEnhancementMd)
		patch.avelEnhancementMd = additions;
	if (draft.layer !== skill.layer) patch.layer = draft.layer;
	const roles = inRoleOrder(draft.recommendedFor);
	if (!sameList(roles, inRoleOrder(skill.recommendedFor))) {
		patch.recommendedFor = roles;
	}
	if (draft.sourceId !== skill.source.id) patch.sourceId = draft.sourceId;

	const grants = grantsOf(draft.grants);
	const ioShape = { reads: draft.reads, returns: draft.returns };
	if (draft.type !== skill.type) {
		patch.type = draft.type;
		if (draft.type === "capability") {
			patch.grants = grants;
			patch.ioShape = ioShape;
		} else {
			patch.grants = null;
			patch.ioShape = null;
		}
	} else if (skill.type === "capability") {
		if (!sameList(grants, skill.grants)) patch.grants = grants;
		if (
			ioShape.reads !== skill.ioShape.reads ||
			ioShape.returns !== skill.ioShape.returns
		) {
			patch.ioShape = ioShape;
		}
	}
	return Object.keys(patch).length === 0 ? null : patch;
}

/** The fields skill.contentSha256 covers (src/lib/skill-hash.ts). */
const HASHED = [
	"description",
	"contentMd",
	"avelEnhancementMd",
	"type",
	"layer",
	"grants",
	"ioShape",
] as const;

/** Whether a patch touches a hashed field, which returns an approved skill to draft. */
export function changesHash(patch: UpdateSkillBody | null): boolean {
	return patch !== null && HASHED.some((field) => field in patch);
}

/** The form's fields, by the body's names. */
const FIELDS = new Set([
	"slug",
	"name",
	"description",
	"contentMd",
	"avelEnhancementMd",
	"layer",
	"type",
	"recommendedFor",
	"sourceId",
	"grants",
	"ioShape",
]);

/** An issue's field, when the form has it. */
export function skillFieldOf(path: IssuePath): string | null {
	const head = path[0];
	return typeof head === "string" && FIELDS.has(head) ? head : null;
}

/** Copy per field. The validator's own message is for logs, never shown. */
export const SKILL_FIELD_COPY: Record<string, string> = {
	slug: "Lowercase letters, digits and single hyphens, up to 100 characters.",
	name: "Give it a name of 1 to 200 characters.",
	description: `Say when to use it in 1 to ${DESCRIPTION_MAX} characters.`,
	contentMd: "Write the instructions, up to 100,000 characters.",
	avelEnhancementMd: "Up to 100,000 characters, or leave it empty.",
	layer: "Choose a layer.",
	type: "A capability needs grants and an io shape; knowledge has neither.",
	recommendedFor: "Choose at least one role.",
	sourceId: "Choose where the skill comes from.",
	grants: "List at least one tool the room provides, one per line.",
	ioShape: "Choose what it reads and what it returns.",
};

/** A live skill already has the slug: the one 409 a save can fix by itself. */
export const SLUG_TAKEN = "Another live skill has this slug. Choose another.";

/**
 * The contract's own check, run before sending, so a mistake is marked on
 * its field without a round trip.
 */
export function checkBody(
	body: CreateSkillBody | UpdateSkillBody,
	mode: "create" | "edit",
): FieldIssue[] {
	const parsed =
		mode === "create"
			? createSkillBody.safeParse(body)
			: updateSkillBody.safeParse(body);
	return parsed.success
		? []
		: parsed.error.issues.map(({ path, message }) => ({ path, message }));
}

/** Each field's messages: the check before sending, else the server's refusal. */
export function fieldMessages(
	local: readonly FieldIssue[],
	error: ApiError | null,
	sentSlug: boolean,
): Record<string, string[]> {
	const issues = local.length > 0 ? local : issuesOf(error);
	const { byField } = placeIssues(
		issues,
		skillFieldOf,
		(issue) =>
			SKILL_FIELD_COPY[String(issue.path[0])] ?? "A value here isn't accepted.",
	);
	if (
		sentSlug &&
		error instanceof ApiError &&
		error.failure.kind === "contract" &&
		error.failure.code === "CONFLICT"
	) {
		byField.slug = [...(byField.slug ?? []), SLUG_TAKEN];
	}
	return byField;
}

/** The one paragraph a field shows: its messages, each once. */
const messageOf = (messages: readonly string[] | undefined) =>
	messages && messages.length > 0
		? [...new Set(messages)].join(" ")
		: undefined;

/** Why the save is held, or undefined when it can go. */
export function saveBlocker({
	skill,
	patch,
	sources,
}: {
	skill: Skill | undefined;
	patch: UpdateSkillBody | null;
	sources: readonly SkillSource[];
}): string | undefined {
	if (skill?.status === "retired") return "A retired skill can't be edited.";
	if (skill && patch === null) return "Nothing has changed yet.";
	if (!skill && sources.length === 0) {
		return "Add a source first: every skill names where it comes from.";
	}
	return undefined;
}

/** What saving does to the version and the status, said before it is sent. */
export function saveEffect(
	skill: Skill | undefined,
	patch: UpdateSkillBody | null,
): { version: number; lines: string[] } {
	if (!skill) {
		return {
			version: 1,
			lines: [
				"Saves as a draft at v1.",
				"A draft is reviewed and approved before any role or mission can carry it.",
			],
		};
	}
	const next = skill.version + 1;
	const lines = [
		`Saving makes this v${next}. It is v${skill.version} now, and its content hash is computed again.`,
	];
	if (skill.status === "approved") {
		lines.push(
			changesHash(patch)
				? "This change returns it to draft, so it is approved again before anything new can carry it."
				: "It stays approved: its name, slug, roles and source are not part of the hash.",
		);
	}
	return { version: next, lines };
}

// ---------------------------------------------------------------------------

const LAYERS: { value: SkillLayer; label: string; meaning: string }[] = [
	{
		value: "role",
		label: "Role",
		meaning:
			"Part of an agent's identity, through the roles it is attached to.",
	},
	{
		value: "stack",
		label: "Stack",
		meaning: "Given at dispatch, to missions that use this stack.",
	},
	{
		value: "domain",
		label: "Domain",
		meaning: "Given at dispatch, to missions in this domain.",
	},
];

const TYPES: { value: SkillType; label: string; meaning: string }[] = [
	{
		value: "knowledge",
		label: "Knowledge",
		meaning: "Text the agent reads. Nothing to enforce.",
	},
	{
		value: "capability",
		label: "Capability",
		meaning: "A tool the agent's room provides, and nothing else.",
	},
];

/** The roles a skill can be recommended for: Platform's roles are code. */
const TEAMS_WITH_AGENTS = TEAMS.filter((team) => team !== "platform");

/** New skill, in the pane. Sources come from the live list. */
export function NewSkillForm() {
	const sources = useSkillSources();
	const rows = sources.data ? loadedRows(sources.data) : [];
	return <SkillEditor sources={rows} sourcesLoading={sources.isPending} />;
}

/** Edit, in the pane, for a skill already read with its text. */
export function EditSkillForm({ skill }: { skill: Skill }) {
	const sources = useSkillSources();
	const rows = sources.data ? loadedRows(sources.data) : [];
	return (
		<SkillEditor
			skill={skill}
			sources={rows}
			sourcesLoading={sources.isPending}
		/>
	);
}

/**
 * The form. It owns the draft and the request; on success it opens the
 * saved skill, by its slug, which an edit may have changed.
 */
export function SkillEditor({
	skill,
	sources,
	sourcesLoading = false,
}: {
	/** Present when editing; absent for a new skill. */
	skill?: Skill;
	sources: readonly SkillSource[];
	sourcesLoading?: boolean;
}) {
	const navigate = useNavigate();
	const create = useCreateSkill();
	const update = useUpdateSkill();
	const mutation = skill ? update : create;
	const [typed, setDraft] = useState<SkillDraft>(() => draftOf(skill));
	// A new skill names the first internal source until one is chosen; the
	// list may still be loading when the form opens.
	const draft =
		typed.sourceId === ""
			? { ...typed, sourceId: defaultSourceId(sources) }
			: typed;
	// A new skill's slug follows its name until it is typed by hand.
	const [slugTouched, setSlugTouched] = useState(skill !== undefined);
	const [local, setLocal] = useState<FieldIssue[]>([]);
	const [preview, setPreview] = useState(false);

	const patch = skill ? patchOf(skill, draft) : null;
	const blocker = saveBlocker({ skill, patch, sources });
	const effect = saveEffect(skill, patch);
	// SKILL.md as the agent will read it, at the version the save makes.
	const previewText = skillMarkdown({ ...draft, version: effect.version });
	const fenceEnd = previewText.split("\n").indexOf("---", 1);
	const contentId = useId();
	const sentSlug = skill ? patch?.slug !== undefined : true;
	const messages = fieldMessages(local, mutation.error, sentSlug);
	const marked = Object.keys(messages).length > 0;

	const set = <K extends keyof SkillDraft>(key: K, value: SkillDraft[K]) => {
		setDraft((current) => ({
			...current,
			[key]: value,
			...(key === "name" && !slugTouched
				? { slug: slugOf(String(value)) }
				: {}),
		}));
		setLocal([]);
	};

	const submit = () => {
		if (blocker) return;
		const body = skill ? patch : createBodyOf(draft);
		if (body === null) return;
		const issues = checkBody(body, skill ? "edit" : "create");
		setLocal(issues);
		if (issues.length > 0) return;
		const opened = (saved: Skill) =>
			navigate({ to: "/catalog/skills", search: { skill: saved.slug } });
		if (skill && patch) {
			update.mutate(
				{ id: skill.id, patch },
				{
					onSuccess: (saved) => {
						toast.success(`Saved ${saved.name} as v${saved.version}.`);
						opened(saved);
					},
				},
			);
		} else {
			create.mutate(createBodyOf(draft), {
				onSuccess: (saved) => {
					toast.success(`Created ${saved.name} as a draft.`);
					opened(saved);
				},
			});
		}
	};

	const sourceOptions =
		skill && !sources.some((source) => source.id === skill.source.id)
			? [{ ...skill.source }, ...sources]
			: sources;

	const changes = skill
		? fieldChanges(draftOf(skill), draft, [
				{ key: "name", label: "Name" },
				{ key: "slug", label: "Slug", mono: true },
				{ key: "layer", label: "Layer", mono: true },
				{ key: "type", label: "Type", mono: true },
				{ key: "recommendedFor", label: "Recommended for", mono: true },
			])
		: [];
	// Long text changes are named, never printed: the diff is the editor.
	const textChanged = (
		[
			["description", "When to use it"],
			["contentMd", "Instructions"],
			["avelEnhancementMd", "AVEL's additions"],
			["grants", "Grants"],
		] as const
	).filter(([key]) => patch && key in patch);
	const sourceName = (id: string) =>
		sourceOptions.find((source) => source.id === id)?.name ?? id;

	const title = skill ? `Edit ${skill.name}` : "New skill";
	return (
		<section
			aria-labelledby="skill-editor-title"
			data-testid={skill ? "skill-edit" : "skill-new"}
			data-mode={skill ? "edit" : "create"}
			className="flex flex-col gap-4 pb-6"
		>
			<header className="flex flex-col gap-1">
				<h2 id="skill-editor-title" className="type-page text-foreground">
					{title}
				</h2>
				<p className="type-body text-text-muted">
					{skill
						? "Change what the skill says or where it applies. Every save is a new version."
						: "Saved as a draft, then reviewed and approved before any role or mission can carry it."}
				</p>
			</header>
			<form
				data-testid={skill ? "skill-edit-form" : "skill-new-form"}
				className="flex flex-col gap-5 rounded-card border border-border bg-app-panel p-4 shadow-card"
				onSubmit={(event) => {
					event.preventDefault();
					submit();
				}}
			>
				<div className="grid gap-4 md:grid-cols-2">
					<Field
						label="Name"
						error={messageOf(messages.name)}
						testid="skill-editor-name"
					>
						{(props) => (
							<Input
								{...props}
								maxLength={200}
								placeholder="Release notes"
								value={draft.name}
								onChange={(event) => set("name", event.target.value)}
							/>
						)}
					</Field>
					<Field
						label="Slug"
						hint="The file name in an export"
						error={messageOf(messages.slug)}
						testid="skill-editor-slug"
					>
						{(props) => (
							<Input
								{...props}
								maxLength={100}
								className="type-mono"
								placeholder="release-notes"
								value={draft.slug}
								onChange={(event) => {
									setSlugTouched(true);
									set("slug", event.target.value);
								}}
							/>
						)}
					</Field>
				</div>
				<Field
					label="When to use it"
					hint="The agent reads only this to decide."
					error={messageOf(messages.description)}
					testid="skill-editor-description"
				>
					{(props) => (
						<div className="flex flex-col gap-1">
							<Textarea
								{...props}
								rows={2}
								value={draft.description}
								onChange={(event) => set("description", event.target.value)}
							/>
							<p
								data-testid="skill-editor-description-length"
								data-length={draft.description.length}
								aria-live="polite"
								className={cn(
									"type-caption",
									draft.description.length > DESCRIPTION_MAX
										? "text-gate-block"
										: "text-text-subtle",
								)}
							>
								<span className="type-mono">{`${draft.description.length} of ${DESCRIPTION_MAX}`}</span>
								{" characters, loaded on every dispatch"}
							</p>
						</div>
					)}
				</Field>
				<div className="grid gap-4 md:grid-cols-2">
					<Segments
						legend="Layer"
						options={LAYERS}
						value={draft.layer}
						onChange={(value) => set("layer", value)}
						error={messageOf(messages.layer)}
						data-testid="skill-editor-layer"
					/>
					<Segments
						legend="Type"
						options={TYPES}
						value={draft.type}
						onChange={(value) => set("type", value)}
						error={messageOf(messages.type)}
						data-testid="skill-editor-type"
					/>
				</div>
				{draft.type === "capability" ? (
					<div
						data-testid="skill-editor-capability"
						className="grid gap-4 rounded-control border border-border bg-app-well p-3 md:grid-cols-2"
					>
						<Field
							label="Grants"
							hint="One tool per line"
							error={messageOf(messages.grants)}
							testid="skill-editor-grants"
						>
							{(props) => (
								<Textarea
									{...props}
									rows={3}
									className="type-mono"
									placeholder="Read access to the database"
									value={draft.grants}
									onChange={(event) => set("grants", event.target.value)}
								/>
							)}
						</Field>
						<div className="flex flex-col gap-3">
							<Segments
								legend="Reads"
								options={IO_SIZES.map((size) => ({
									value: size,
									label: size,
								}))}
								value={draft.reads}
								onChange={(value) => set("reads", value)}
								error={messageOf(messages.ioShape)}
								data-testid="skill-editor-reads"
							/>
							<Segments
								legend="Returns"
								options={IO_SIZES.map((size) => ({
									value: size,
									label: size,
								}))}
								value={draft.returns}
								onChange={(value) => set("returns", value)}
								data-testid="skill-editor-returns"
							/>
						</div>
					</div>
				) : null}
				<RolePicker
					value={draft.recommendedFor}
					onChange={(roles) => set("recommendedFor", roles)}
					error={messageOf(messages.recommendedFor)}
				/>
				<Field
					label="Source"
					hint="Where the skill comes from"
					error={messageOf(messages.sourceId)}
					testid="skill-editor-source"
				>
					{({ id, "data-testid": testId, ...aria }) => (
						<div className="flex flex-wrap items-center gap-3">
							<Select
								value={draft.sourceId === "" ? undefined : draft.sourceId}
								onValueChange={(next) => set("sourceId", next)}
								disabled={sourceOptions.length === 0}
							>
								<SelectTrigger
									id={id}
									data-testid={testId}
									className="w-72"
									{...aria}
								>
									<SelectValue
										placeholder={
											sourcesLoading ? "Loading sources" : "No sources yet"
										}
									/>
								</SelectTrigger>
								<SelectContent>
									{sourceOptions.map((source) => (
										<SelectItem key={source.id} value={source.id}>
											{`${source.name} (${source.kind})`}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<Link
								to="/catalog/skills"
								search={{ view: "sources" }}
								data-testid="skill-editor-sources-link"
								className="type-small text-accent-text underline-offset-4 hover:underline"
							>
								Manage sources
							</Link>
						</div>
					)}
				</Field>
				<div className="flex flex-col gap-1.5">
					<div className="flex flex-wrap items-center justify-between gap-2">
						<label
							htmlFor={contentId}
							className="type-small font-medium text-foreground"
						>
							Instructions
							<span className="ml-2 font-normal text-text-subtle">
								Markdown, loaded only when the task needs it
							</span>
						</label>
						<fieldset
							className={tabsListVariants({ variant: "default" })}
							data-testid="skill-editor-content-mode"
						>
							<legend className="sr-only">Show the instructions as</legend>
							{(
								[
									[false, "Write"],
									[true, "Preview"],
								] as const
							).map(([on, label]) => (
								<Button
									key={label}
									type="button"
									variant="segment"
									aria-pressed={preview === on}
									data-testid={`skill-editor-${label.toLowerCase()}`}
									onClick={() => setPreview(on)}
								>
									{label}
								</Button>
							))}
						</fieldset>
					</div>
					{preview ? (
						<CodeView
							text={previewText}
							label="SKILL.md as it will be saved"
							data-testid="skill-editor-preview"
							lineTone={(line, index) => skillLineTone(line, index, fenceEnd)}
						/>
					) : (
						<Textarea
							id={contentId}
							rows={14}
							className="type-mono"
							data-testid="skill-editor-content"
							aria-invalid={messages.contentMd ? true : undefined}
							aria-describedby={
								messages.contentMd ? `${contentId}-error` : undefined
							}
							value={draft.contentMd}
							onChange={(event) => set("contentMd", event.target.value)}
						/>
					)}
					{messages.contentMd ? (
						<p
							id={`${contentId}-error`}
							data-testid="skill-editor-content-error"
							className="type-small text-gate-block"
						>
							{messageOf(messages.contentMd)}
						</p>
					) : null}
				</div>
				<Field
					label="AVEL's additions"
					hint="Optional. Kept apart from an imported original"
					error={messageOf(messages.avelEnhancementMd)}
					testid="skill-editor-additions"
				>
					{(props) => (
						<Textarea
							{...props}
							rows={4}
							className="type-mono"
							value={draft.avelEnhancementMd}
							onChange={(event) => set("avelEnhancementMd", event.target.value)}
						/>
					)}
				</Field>
				{skill ? (
					<WhatChanges
						changes={[
							...changes,
							...textChanged.map(([, label]) => ({
								label,
								kind: "change" as const,
								to: "edited",
							})),
							...(patch?.sourceId
								? [
										{
											label: "Source",
											kind: "change" as const,
											from: skill.source.name,
											to: sourceName(patch.sourceId),
										},
									]
								: []),
						]}
						data-testid="skill-editor-changes"
					/>
				) : null}
				<section
					aria-label="What saving does"
					data-testid="skill-editor-effect"
					data-version-next={effect.version}
					data-returns-to-draft={
						skill?.status === "approved" && changesHash(patch)
							? true
							: undefined
					}
					className="flex flex-col gap-1 rounded-control border border-border bg-app-band px-3 py-2"
				>
					<h3 className="type-caption text-text-subtle">
						Saving{" "}
						<span className="type-mono text-foreground">{`v${effect.version}`}</span>
					</h3>
					{effect.lines.map((line) => (
						<p key={line} className="type-small text-foreground">
							{line}
						</p>
					))}
				</section>
				<FormError error={mutation.error} hasFieldErrors={marked} />
				<div className="flex flex-wrap items-center justify-end gap-2">
					<Button variant="ghost" asChild>
						<Link
							to="/catalog/skills"
							search={skill ? { skill: skill.slug } : {}}
							data-testid="skill-editor-cancel"
						>
							Cancel
						</Link>
					</Button>
					<Button
						type="submit"
						data-testid="skill-editor-submit"
						disabled={mutation.isPending}
						disabledReason={blocker}
					>
						{mutation.isPending
							? "Saving"
							: skill
								? `Save as v${effect.version}`
								: "Save as draft"}
					</Button>
				</div>
			</form>
		</section>
	);
}

/** A labelled segmented control, v3's track, each option a pressed button. */
export function Segments<T extends string>({
	legend,
	options,
	value,
	onChange,
	error,
	"data-testid": testId,
}: {
	legend: string;
	options: readonly { value: T; label: string; meaning?: string }[];
	value: T;
	onChange: (value: T) => void;
	error?: string;
	"data-testid": string;
}) {
	const meaning = options.find((option) => option.value === value)?.meaning;
	return (
		<fieldset data-testid={testId} className="flex min-w-0 flex-col gap-1.5">
			<legend className="mb-1.5 type-small font-medium text-foreground">
				{legend}
			</legend>
			<div
				className={cn(tabsListVariants({ variant: "default" }), "self-start")}
			>
				{options.map((option) => (
					<Button
						key={option.value}
						type="button"
						variant="segment"
						aria-pressed={option.value === value}
						data-testid={`${testId}-${option.value}`}
						onClick={() => onChange(option.value)}
					>
						{option.label}
					</Button>
				))}
			</div>
			{meaning ? (
				<p className="type-caption text-text-subtle">{meaning}</p>
			) : null}
			{error ? (
				<p
					data-testid={`${testId}-error`}
					className="type-small text-gate-block"
				>
					{error}
				</p>
			) : null}
		</fieldset>
	);
}

/**
 * The roles a skill is recommended for, one toggle per role, grouped by
 * team. For a stack or domain skill this is who receives it at dispatch.
 */
function RolePicker({
	value,
	onChange,
	error,
}: {
	value: readonly Role[];
	onChange: (roles: Role[]) => void;
	error?: string;
}) {
	const toggle = (role: Role) =>
		onChange(
			value.includes(role)
				? value.filter((r) => r !== role)
				: inRoleOrder([...value, role]),
		);
	return (
		<fieldset
			data-testid="skill-editor-roles"
			data-count={value.length}
			className="flex min-w-0 flex-col gap-2"
		>
			<legend className="mb-1.5 type-small font-medium text-foreground">
				Recommended for
				<span className="ml-2 font-normal text-text-subtle">
					{value.length === 1 ? "1 role" : `${value.length} roles`}
				</span>
			</legend>
			<div className="grid grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-3">
				{TEAMS_WITH_AGENTS.map((team) => (
					<RoleGroup
						key={team}
						label={TEAM_LABELS[team].label}
						roles={ROLES.filter((role) => ROLE_TEAM[role] === team)}
						value={value}
						onToggle={toggle}
					/>
				))}
			</div>
			{error ? (
				<p
					data-testid="skill-editor-roles-error"
					className="type-small text-gate-block"
				>
					{error}
				</p>
			) : null}
		</fieldset>
	);
}

function RoleGroup({
	label,
	roles,
	value,
	onToggle,
}: {
	label: string;
	roles: readonly Role[];
	value: readonly Role[];
	onToggle: (role: Role) => void;
}) {
	return (
		<fieldset className="flex flex-col gap-1.5 rounded-card border border-border bg-app-well p-2.5">
			<legend className="sr-only">{label}</legend>
			<span
				aria-hidden="true"
				className="type-caption font-medium text-text-muted"
			>
				{label}
			</span>
			<div className="flex flex-wrap gap-1.5">
				{roles.map((role) => {
					const on = value.includes(role);
					return (
						<button
							key={role}
							type="button"
							aria-pressed={on}
							data-testid={`skill-editor-role-${role}`}
							title={role}
							onClick={() => onToggle(role)}
							className={cn(
								"focus-inset inline-flex h-7 items-center rounded-sm border px-2 type-small transition-colors duration-(--duration-micro) ease-avel",
								on
									? "border-selected-border bg-selected text-accent-text"
									: "border-border bg-app-panel text-text-muted hover:bg-app-raised",
							)}
						>
							{ROLE_LABELS[role]}
						</button>
					);
				})}
			</div>
		</fieldset>
	);
}
