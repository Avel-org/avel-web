import type { SkillSource } from "avel-server/contract";
import { toast } from "sonner";
import { useRemoveSkillSource } from "@/lib/api/catalog";
import { PRECONDITION_COPY } from "@/lib/error-map";
import { ActionModal } from "./action-modal";
import { WhatChanges } from "./what-changes";

const IN_USE = PRECONDITION_COPY.skill_source_in_use;

/**
 * Why Remove is held: the server refuses while any live skill comes from
 * the source (422 skill_source_in_use), and never deletes or moves the
 * skills. Null when it may go.
 */
export function removeHeldReason(
	source: Pick<SkillSource, "skillCount">,
): string | null {
	return source.skillCount > 0 ? `${IN_USE.what} ${IN_USE.next}` : null;
}

/** "3 skills come from this source", "No skills come from this source". */
export function skillsFromLine(count: number): string {
	if (count === 0) return "No skills come from this source.";
	return count === 1
		? "1 skill comes from this source."
		: `${count} skills come from this source.`;
}

/**
 * Remove a source (Confirm, destructive: there is no undo). It says what
 * removing does, from the server's own rule: refused while skills come from
 * it; otherwise the source leaves the catalog and nothing else changes.
 */
export function RemoveSourceModal({
	source,
	open,
	onOpenChange,
}: {
	source: SkillSource | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const remove = useRemoveSkillSource();
	if (source === null) return null;
	return (
		<RemoveSourceConfirm
			source={source}
			open={open}
			onOpenChange={(next) => {
				if (!next) remove.reset();
				onOpenChange(next);
			}}
			pending={remove.isPending}
			error={remove.error}
			onRemove={() =>
				remove.mutate(source.id, {
					onSuccess: () => {
						toast.success(`Removed ${source.name}.`);
						onOpenChange(false);
					},
				})
			}
		/>
	);
}

export function RemoveSourceConfirm({
	source,
	open = true,
	onOpenChange = () => {},
	pending,
	error,
	onRemove,
}: {
	source: SkillSource;
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	pending: boolean;
	error: Parameters<typeof ActionModal>[0]["error"];
	onRemove: () => void;
}) {
	const held = removeHeldReason(source);
	return (
		<ActionModal
			open={open}
			onOpenChange={onOpenChange}
			size="confirm"
			title={`Remove ${source.name}`}
			dirty={false}
			destructive
			submitLabel="Remove source"
			pendingLabel="Removing"
			onSubmit={onRemove}
			pending={pending}
			submitDisabledReason={held ?? undefined}
			error={error}
			changes={
				held === null ? (
					<WhatChanges
						data-testid="source-remove-changes"
						changes={[{ label: "Source", kind: "remove", from: source.name }]}
					/>
				) : undefined
			}
			data-testid="source-remove"
		>
			<p
				data-testid="source-remove-skills"
				className="type-body text-foreground tabular-nums"
			>
				{skillsFromLine(source.skillCount)}
			</p>
			<p
				data-testid="source-remove-effect"
				className="type-small text-text-muted"
			>
				{held ??
					"Removing it takes it out of the catalog. Nothing else changes, and it can't be undone."}
			</p>
		</ActionModal>
	);
}
