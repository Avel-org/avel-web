import { useNavigate } from "@tanstack/react-router";
import {
	type AgentKind,
	type CreateAgentTemplateBody,
	KIND_LABELS,
	ROLE_LABELS,
	type Role,
	TEAM_LABELS,
	WAVES,
	type Wave,
} from "avel-server/contract";
import { Plus } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { tabsListVariants } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useCreateAgentTemplate } from "@/lib/api/catalog";
import { cn } from "@/lib/utils";
import { ActionModal, type IssuePath } from "./action-modal";
import {
	crossSidesWarning,
	DESCRIPTION_MAX,
	plainWordsProblem,
	refusalSpecifics,
	roleBlockedReason,
	rolesByTeam,
	TITLE_MAX,
} from "./agent-edit";
import { slugOf } from "./catalog-skill-editor";
import { type Change, WhatChanges } from "./what-changes";

/*
 * A new agent (POST /api/agent-templates, avel-server 2026-10-21). Eight
 * inputs, so a two-step Stepper (ruling 35): who it is, then its work. The
 * server creates it at version 1 with no identity, so the agent can't be
 * dispatched until its identity is generated on its page, and the toast says
 * so. The role rules are agent edit's own: one side only, Project setup
 * held alone.
 */

const STEPS = ["Who", "Work"] as const;

export type AgentDraft = {
	name: string;
	/** Typed by hand once edited; otherwise follows the name. */
	slug: string | null;
	title: string;
	description: string;
	kind: AgentKind;
	roles: Role[];
	waves: Wave[];
	/** One glob per line, as typed. */
	paths: string;
};

export const EMPTY_AGENT: AgentDraft = {
	name: "",
	slug: null,
	title: "",
	description: "",
	kind: "feature",
	roles: [],
	waves: [],
	paths: "",
};

/** The slug the draft will be created with. */
export const draftSlug = (draft: AgentDraft) =>
	draft.slug ?? slugOf(draft.name);

/** The globs typed, one per line, trimmed, blanks dropped, each once. */
export function pathsOf(text: string): string[] {
	return [
		...new Set(
			text
				.split("\n")
				.map((line) => line.trim())
				.filter((line) => line !== ""),
		),
	];
}

/** The create body, from a draft. Blank optional fields are left out. */
export function createAgentBody(draft: AgentDraft): CreateAgentTemplateBody {
	const title = draft.title.trim();
	const description = draft.description.trim();
	return {
		slug: draftSlug(draft),
		name: draft.name.trim(),
		kind: draft.kind,
		roles: draft.roles,
		waveDefaults: WAVES.filter((w) => draft.waves.includes(w)),
		writablePaths: pathsOf(draft.paths),
		...(title === "" ? {} : { title }),
		...(description === "" ? {} : { description }),
	};
}

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Why step one can't go on yet, or undefined. */
export function whoBlocked(draft: AgentDraft): string | undefined {
	if (draft.name.trim() === "") return "Name the agent first";
	const slug = draftSlug(draft);
	if (slug === "" || !SLUG.test(slug))
		return "The slug takes lowercase letters, digits and single hyphens";
	// Both are optional: only what is typed is checked.
	const optional = (text: string, max: number) =>
		text.trim() === "" ? null : plainWordsProblem(text, max);
	return (
		optional(draft.title, TITLE_MAX) ??
		optional(draft.description, DESCRIPTION_MAX) ??
		undefined
	);
}

/** Why step two can't create yet, or undefined. */
export function workBlocked(draft: AgentDraft): string | undefined {
	if (draft.roles.length === 0) return "Choose at least one role";
	if (crossSidesWarning(draft.roles)) return "Its roles cross sides";
	if (pathsOf(draft.paths).length === 0)
		return "Give it at least one path it may change";
	return undefined;
}

/** The request, in words, for the What changes strip. */
export function createChanges(draft: AgentDraft): Change[] {
	const body = createAgentBody(draft);
	return [
		{ kind: "add", label: "Agent", to: `${body.name} (${body.slug})` },
		{ kind: "add", label: "Kind", to: KIND_LABELS[body.kind] },
		{
			kind: "add",
			label: "Roles",
			to: body.roles.map((role) => ROLE_LABELS[role]).join(", "),
		},
		{
			kind: "add",
			label: "Waves",
			to:
				body.waveDefaults.length === 0
					? "None by default"
					: body.waveDefaults.join(", "),
		},
		{
			kind: "add",
			label: "May change",
			to: body.writablePaths.join(", "),
			mono: true,
		},
	];
}

/** A slug taken by a live template is 409: said on the slug's own field. */
function fieldOf(path: IssuePath): string | null {
	const head = path[0];
	return typeof head === "string" ? head : null;
}

export function NewAgentButton() {
	const [open, setOpen] = useState(false);
	return (
		<>
			<Button size="sm" data-testid="agent-new" onClick={() => setOpen(true)}>
				<Plus aria-hidden="true" />
				New agent
			</Button>
			{open ? <NewAgentModal onClose={() => setOpen(false)} /> : null}
		</>
	);
}

export function NewAgentModal({ onClose }: { onClose: () => void }) {
	const [draft, setDraft] = useState<AgentDraft>(EMPTY_AGENT);
	const [step, setStep] = useState(0);
	const create = useCreateAgentTemplate();
	const navigate = useNavigate();
	const set = (patch: Partial<AgentDraft>) =>
		setDraft((d) => ({ ...d, ...patch }));
	const blocked = step === 0 ? whoBlocked(draft) : workBlocked(draft);
	const refusal = create.error
		? refusalSpecifics(create.error, draft.roles)
		: null;
	const name = draft.name.trim();
	return (
		<ActionModal
			open
			onOpenChange={(next) => {
				if (!next) onClose();
			}}
			size="stepper"
			title="New agent"
			description="Who the agent is, then the work it does. It starts at version 1, with no identity until you generate one."
			dirty={draft !== EMPTY_AGENT}
			steps={STEPS}
			stepStyle="pills"
			step={step}
			onBack={() => setStep(0)}
			submitLabel={step === 0 ? "Next" : `Create ${name || "agent"}`}
			pendingLabel="Creating"
			submitDisabledReason={blocked}
			onSubmit={() => {
				if (step === 0) {
					setStep(1);
					return;
				}
				create.mutate(createAgentBody(draft), {
					onSuccess: (agent) => {
						onClose();
						toast.success(
							`Created ${agent.name}. Generate its identity on its page before it can be dispatched.`,
						);
						void navigate({
							to: "/catalog/agents/$slug",
							params: { slug: agent.slug },
						});
					},
				});
			}}
			pending={create.isPending}
			error={create.error}
			fieldOf={fieldOf}
			changes={
				step === 1 ? (
					<WhatChanges
						changes={createChanges(draft)}
						data-testid="agent-new-changes"
					/>
				) : undefined
			}
			data-testid="agent-new-modal"
		>
			{step === 0 ? (
				<WhoStep draft={draft} set={set} />
			) : (
				<WorkStep draft={draft} set={set} refusal={refusal} />
			)}
		</ActionModal>
	);
}

function Field({
	label,
	hint,
	children,
	htmlFor,
}: {
	label: string;
	hint?: string;
	htmlFor: string;
	children: React.ReactNode;
}) {
	return (
		<div className="flex flex-col gap-1.5">
			<label htmlFor={htmlFor} className="type-small font-medium text-text">
				{label}
			</label>
			{children}
			{hint ? <p className="type-caption text-text-subtle">{hint}</p> : null}
		</div>
	);
}

function WhoStep({
	draft,
	set,
}: {
	draft: AgentDraft;
	set: (patch: Partial<AgentDraft>) => void;
}) {
	const id = useId();
	return (
		<div data-testid="agent-new-who" className="flex flex-col gap-4">
			<div className="grid gap-4 sm:grid-cols-2">
				<Field label="Name" htmlFor={`${id}-name`}>
					<Input
						id={`${id}-name`}
						autoFocus
						value={draft.name}
						placeholder="Atlas"
						data-testid="agent-new-name"
						onChange={(e) => set({ name: e.target.value })}
					/>
				</Field>
				<Field
					label="Slug"
					htmlFor={`${id}-slug`}
					hint="Its name in links and refs. Can't be changed later."
				>
					<Input
						id={`${id}-slug`}
						value={draftSlug(draft)}
						className="font-mono"
						data-testid="agent-new-slug"
						onChange={(e) => set({ slug: e.target.value })}
					/>
				</Field>
			</div>
			<Field label="Title" htmlFor={`${id}-title`} hint="Optional.">
				<Input
					id={`${id}-title`}
					value={draft.title}
					placeholder="Full-stack lead"
					data-testid="agent-new-title"
					onChange={(e) => set({ title: e.target.value })}
				/>
			</Field>
			<Field
				label="Description"
				htmlFor={`${id}-description`}
				hint={`Optional. What it does, in plain words, ${DESCRIPTION_MAX} characters at most.`}
			>
				<Textarea
					id={`${id}-description`}
					rows={3}
					value={draft.description}
					data-testid="agent-new-description"
					onChange={(e) => set({ description: e.target.value })}
				/>
			</Field>
			<fieldset className="flex flex-col gap-1.5">
				<legend className="pb-1.5 type-small font-medium text-text">
					Kind
				</legend>
				<span
					data-testid="agent-new-kind"
					className={cn(tabsListVariants({ variant: "default" }), "self-start")}
				>
					{(["feature", "horizontal"] as const).map((kind) => (
						<Button
							key={kind}
							type="button"
							variant="segment"
							aria-pressed={draft.kind === kind}
							data-testid={`agent-new-kind-${kind}`}
							onClick={() => set({ kind })}
						>
							{KIND_LABELS[kind]}
						</Button>
					))}
				</span>
			</fieldset>
		</div>
	);
}

function WorkStep({
	draft,
	set,
	refusal,
}: {
	draft: AgentDraft;
	set: (patch: Partial<AgentDraft>) => void;
	refusal: string | null;
}) {
	const id = useId();
	const warning = crossSidesWarning(draft.roles);
	const toggleRole = (role: Role, on: boolean) =>
		set({
			roles: on
				? [...draft.roles, role]
				: draft.roles.filter((r) => r !== role),
		});
	const toggleWave = (wave: Wave) =>
		set({
			waves: draft.waves.includes(wave)
				? draft.waves.filter((w) => w !== wave)
				: [...draft.waves, wave],
		});
	return (
		<div data-testid="agent-new-work" className="flex flex-col gap-5">
			<fieldset className="flex flex-col gap-2">
				<legend className="pb-1 type-small font-medium text-text">Roles</legend>
				<div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
					{rolesByTeam().map(({ team, roles }) => (
						<div
							key={team}
							data-testid={`agent-new-team-${team}`}
							className="flex min-w-0 flex-col gap-1"
						>
							<span
								title={TEAM_LABELS[team].meaning}
								className="type-caption text-text-subtle"
							>
								{TEAM_LABELS[team].label}
							</span>
							{roles.map((role) => {
								const reason = roleBlockedReason(draft.roles, role);
								const boxId = `${id}-role-${role}`;
								return (
									<span key={role} className="flex items-center gap-2">
										<Checkbox
											id={boxId}
											checked={draft.roles.includes(role)}
											disabled={reason !== undefined}
											data-testid={`agent-new-role-${role}`}
											onCheckedChange={(on) => toggleRole(role, on === true)}
										/>
										<label
											htmlFor={boxId}
											title={reason}
											className={cn(
												"type-small",
												reason ? "text-text-subtle" : "text-text",
											)}
										>
											{ROLE_LABELS[role]}
										</label>
									</span>
								);
							})}
						</div>
					))}
				</div>
				{warning ? (
					<p
						role="alert"
						data-testid="agent-new-roles-warning"
						className="type-small text-gate-warn"
					>
						{warning}
					</p>
				) : null}
				{refusal ? (
					<p
						data-testid="agent-new-refusal"
						className="type-small text-gate-block"
					>
						{refusal}
					</p>
				) : null}
			</fieldset>
			<fieldset className="flex flex-col gap-1.5">
				<legend className="pb-1.5 type-small font-medium text-text">
					Waves it joins by default
				</legend>
				<span
					data-testid="agent-new-waves"
					className={cn(tabsListVariants({ variant: "default" }), "self-start")}
				>
					{WAVES.map((wave) => (
						<Button
							key={wave}
							type="button"
							variant="segment"
							aria-pressed={draft.waves.includes(wave)}
							data-testid={`agent-new-wave-${wave}`}
							className="w-9 tabular-nums"
							onClick={() => toggleWave(wave)}
						>
							{wave}
						</Button>
					))}
				</span>
				<p className="type-caption text-text-subtle">
					None is allowed: a team chooses its waves when it is built.
				</p>
			</fieldset>
			<Field
				label="Paths it may change"
				htmlFor={`${id}-paths`}
				hint="One glob per line, such as src/booking/**. At least one."
			>
				<Textarea
					id={`${id}-paths`}
					rows={3}
					value={draft.paths}
					className="font-mono"
					placeholder="src/booking/**"
					data-testid="agent-new-paths"
					onChange={(e) => set({ paths: e.target.value })}
				/>
			</Field>
		</div>
	);
}
