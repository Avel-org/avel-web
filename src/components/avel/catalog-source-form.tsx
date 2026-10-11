import type { SkillSource, SkillSourceKind } from "avel-server/contract";
import { useId, useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { ApiError } from "@/lib/api";
import {
	changedSourceFields,
	type SourceDraft,
	sourceBodyOf,
	sourceDraftOf,
	sourceFieldOf,
	sourceIssueCopy,
	sourceProblems,
	useCreateSkillSource,
	useUpdateSkillSource,
} from "@/lib/api/catalog";
import { ActionModal, ModalField, useFieldIssues } from "./action-modal";
import { useOpenGeneration } from "./use-open-generation";
import { fieldChanges, WhatChanges } from "./what-changes";

export const SOURCE_KIND_LABEL: Record<SkillSourceKind, string> = {
	internal: "Internal",
	vendor: "Vendor",
	community: "Community",
};

const KIND_HINT: Record<SkillSourceKind, string> = {
	internal: "AVEL's own skills",
	vendor: "A company's published skills",
	community: "An open, shared index",
};

/**
 * Add source and edit source, in a Form modal (ruling 35). The rules checked
 * before sending are the contract's own createSkillSourceBody; an edit sends
 * only what changed, and WhatChanges shows each field from and to.
 */
export function SourceFormModal({
	open,
	onOpenChange,
	source,
	onSaved,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/** Present when editing; absent when adding. */
	source?: SkillSource;
	onSaved?: (source: SkillSource) => void;
}) {
	const create = useCreateSkillSource();
	const update = useUpdateSkillSource();
	const mutation = source ? update : create;
	const generation = useOpenGeneration(open);

	const submit = (draft: SourceDraft) => {
		const done = (saved: SkillSource, verb: string) => {
			toast.success(`${verb} ${saved.name}.`);
			onOpenChange(false);
			onSaved?.(saved);
		};
		if (source) {
			const patch = changedSourceFields(source, draft);
			if (patch === null) return;
			update.mutate(
				{ id: source.id, patch },
				{ onSuccess: (saved) => done(saved, "Saved") },
			);
		} else {
			create.mutate(sourceBodyOf(draft), {
				onSuccess: (saved) => done(saved, "Added"),
			});
		}
	};

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
			onSubmit={submit}
		/>
	);
}

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
	const initial = sourceDraftOf(source);
	const [draft, setDraft] = useState<SourceDraft>(initial);
	const [tried, setTried] = useState(false);
	const kindId = useId();
	const problems = tried ? sourceProblems(draft) : {};
	const unchanged =
		source !== undefined && changedSourceFields(source, draft) === null;
	const shown = (d: SourceDraft) => ({ ...d, kind: SOURCE_KIND_LABEL[d.kind] });
	const changes = fieldChanges(
		source ? shown(initial) : undefined,
		shown(draft),
		[
			{ key: "name", label: "Name" },
			{ key: "kind", label: "Kind" },
			{ key: "url", label: "Address", mono: true },
			{ key: "license", label: "License", mono: true },
		],
	);
	const set = (change: Partial<SourceDraft>) =>
		setDraft((d) => ({ ...d, ...change }));

	return (
		<ActionModal
			open={open}
			onOpenChange={onOpenChange}
			size="form"
			title={source ? "Edit source" : "Add source"}
			description={
				source
					? `${source.name}. Its skills keep pointing at it.`
					: "Where skills come from: AVEL itself, a vendor or a community index."
			}
			dirty={JSON.stringify(draft) !== JSON.stringify(initial)}
			submitLabel={source ? "Save changes" : "Add source"}
			onSubmit={() => {
				setTried(true);
				if (Object.keys(sourceProblems(draft)).length > 0) return;
				onSubmit(draft);
			}}
			pending={pending}
			submitDisabledReason={unchanged ? "Nothing has changed yet." : undefined}
			error={error}
			fieldOf={sourceFieldOf}
			describeIssue={sourceIssueCopy}
			changes={
				<WhatChanges data-testid="source-form-changes" changes={changes} />
			}
			data-testid="source-form"
		>
			<ModalField
				name="name"
				label="Name"
				error={problems.name}
				testid="source-form-name"
			>
				{(props) => (
					<Input
						{...props}
						autoFocus
						maxLength={200}
						value={draft.name}
						onChange={(e) => set({ name: e.target.value })}
					/>
				)}
			</ModalField>
			<KindField
				value={draft.kind}
				onChange={(kind) => set({ kind })}
				kindId={kindId}
			/>
			<ModalField
				name="url"
				label="Address"
				hint="Optional"
				error={problems.url}
				testid="source-form-url"
			>
				{(props) => (
					<Input
						{...props}
						type="url"
						maxLength={2_000}
						placeholder="https://"
						className="type-mono-small"
						value={draft.url}
						onChange={(e) => set({ url: e.target.value })}
					/>
				)}
			</ModalField>
			<ModalField
				name="license"
				label="License"
				hint="Optional"
				error={problems.license}
				testid="source-form-license"
			>
				{(props) => (
					<Input
						{...props}
						maxLength={200}
						placeholder="MIT"
						className="type-mono-small"
						value={draft.license}
						onChange={(e) => set({ license: e.target.value })}
					/>
				)}
			</ModalField>
		</ActionModal>
	);
}

/**
 * Kind as radios. A custom control, so the refusal's messages for "kind" are
 * read from the modal and shown here, as ModalField does for its fields.
 */
function KindField({
	value,
	onChange,
	kindId,
}: {
	value: SkillSourceKind;
	onChange: (kind: SkillSourceKind) => void;
	kindId: string;
}) {
	const issues = useFieldIssues("kind");
	const errorId = `${kindId}-error`;
	return (
		<fieldset
			className="flex flex-col gap-1.5"
			data-field="kind"
			aria-describedby={issues.length > 0 ? errorId : undefined}
		>
			<legend id={kindId} className="type-small font-medium text-foreground">
				Kind
			</legend>
			<RadioGroup
				aria-labelledby={kindId}
				data-testid="source-form-kind"
				value={value}
				onValueChange={(kind) => onChange(kind as SkillSourceKind)}
				className="flex flex-col gap-1.5"
			>
				{(Object.keys(SOURCE_KIND_LABEL) as SkillSourceKind[]).map((kind) => (
					<label
						key={kind}
						htmlFor={`${kindId}-${kind}`}
						className="type-small flex items-center gap-2 text-foreground"
					>
						<RadioGroupItem
							id={`${kindId}-${kind}`}
							value={kind}
							data-testid={`source-form-kind-${kind}`}
						/>
						{SOURCE_KIND_LABEL[kind]}
						<span className="text-text-subtle">{KIND_HINT[kind]}</span>
					</label>
				))}
			</RadioGroup>
			{issues.length > 0 ? (
				<p
					id={errorId}
					data-testid="source-form-kind-error"
					className="type-small text-gate-block"
				>
					{[...new Set(issues)].join(" ")}
				</p>
			) : null}
		</fieldset>
	);
}
