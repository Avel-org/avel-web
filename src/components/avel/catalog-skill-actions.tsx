import { Link } from "@tanstack/react-router";
import type { Skill, SkillStatus } from "avel-server/contract";
import { Pencil } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useApproveSkill, useRetireSkill } from "@/lib/api/skills";
import { ActionModal } from "./action-modal";
import { shortHash } from "./short-hash";
import { WhatChanges } from "./what-changes";

/*
 * The operator's writes on one skill, in the inspector's header: Edit opens
 * the editor in the pane; Approve and Retire each confirm in a modal that
 * says what changes before anything is sent. Each is held, with its reason,
 * where the server would refuse it (src/routes/skills.ts).
 */

const STATUS_LABEL: Record<SkillStatus, string> = {
	draft: "Draft",
	approved: "Approved",
	retired: "Retired",
};

/** Why Edit is held: a retired skill is 409 on PATCH. */
export function editBlocker(skill: Pick<Skill, "status">): string | undefined {
	return skill.status === "retired"
		? "A retired skill can't be edited."
		: undefined;
}

/** Why Approve is held: only a draft can be approved. */
export function approveBlocker(
	skill: Pick<Skill, "status">,
): string | undefined {
	if (skill.status === "approved") return "This skill is already approved.";
	if (skill.status === "retired") return "A retired skill can't be approved.";
	return undefined;
}

/** Why Retire is held: retiring twice is 409. */
export function retireBlocker(
	skill: Pick<Skill, "status">,
): string | undefined {
	return skill.status === "retired"
		? "This skill is already retired."
		: undefined;
}

export function SkillActions({ skill }: { skill: Skill }) {
	const [open, setOpen] = useState<"approve" | "retire" | null>(null);
	const blocked = editBlocker(skill);
	return (
		<div
			data-testid="skill-actions"
			className="flex shrink-0 items-center gap-2 max-lg:self-end"
		>
			{blocked ? (
				<Button
					size="sm"
					variant="outline"
					data-testid="skill-edit"
					disabledReason={blocked}
				>
					<Pencil aria-hidden="true" />
					Edit
				</Button>
			) : (
				<Button size="sm" variant="outline" asChild>
					<Link
						to="/catalog/skills"
						search={{ skill: skill.slug, view: "edit" }}
						data-testid="skill-edit"
					>
						<Pencil aria-hidden="true" />
						Edit
					</Link>
				</Button>
			)}
			<Button
				size="sm"
				variant="outline"
				data-testid="skill-approve"
				disabledReason={approveBlocker(skill)}
				onClick={() => setOpen("approve")}
			>
				Approve
			</Button>
			<Button
				size="sm"
				variant="destructive"
				data-testid="skill-retire"
				disabledReason={retireBlocker(skill)}
				onClick={() => setOpen("retire")}
			>
				Retire
			</Button>
			<SkillApproveModal
				skill={skill}
				open={open === "approve"}
				onOpenChange={(next) => setOpen(next ? "approve" : null)}
			/>
			<SkillRetireModal
				skill={skill}
				open={open === "retire"}
				onOpenChange={(next) => setOpen(next ? "retire" : null)}
			/>
		</div>
	);
}

/**
 * Approve, a Confirm modal. The body is the hash this page shows, so what
 * is approved is what the operator read: if the skill changed since, the
 * server refuses (409) and the skill is read again.
 */
export function SkillApproveModal({
	skill,
	open,
	onOpenChange,
}: {
	skill: Skill;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const approve = useApproveSkill();
	return (
		<ActionModal
			open={open}
			onOpenChange={(next) => {
				if (!next) approve.reset();
				onOpenChange(next);
			}}
			size="confirm"
			title={`Approve ${skill.name}`}
			description="Approval pins the content hash you reviewed and records you as the reviewer."
			dirty={false}
			submitLabel={`Approve v${skill.version}`}
			pendingLabel="Approving"
			submitDisabledReason={approveBlocker(skill)}
			pending={approve.isPending}
			error={approve.error}
			onSubmit={() =>
				approve.mutate(
					{ id: skill.id, contentSha256: skill.contentSha256 },
					{
						onSuccess: (saved) => {
							toast.success(`Approved ${saved.name}.`);
							onOpenChange(false);
						},
					},
				)
			}
			changes={
				<WhatChanges
					data-testid="skill-approve-changes"
					changes={[
						{
							label: "Status",
							kind: "change",
							from: STATUS_LABEL[skill.status],
							to: STATUS_LABEL.approved,
						},
						{ label: "Reviewer", kind: "add", to: "You" },
						{
							label: "Pinned hash",
							kind: "add",
							to: shortHash(skill.contentSha256),
							mono: true,
						},
					]}
				/>
			}
			data-testid="skill-approve-modal"
		>
			<ul
				data-testid="skill-approve-effects"
				className="flex list-disc flex-col gap-1 pl-4 type-small text-foreground"
			>
				<li>
					{skill.layer === "role"
						? "It can be attached to roles, and becomes part of the identity of every agent covering one."
						: "It can be attached to missions, and reaches the agents whose roles it is recommended for at dispatch."}
				</li>
				<li>
					A later change to its text, type, layer, grants or io shape returns it
					to draft.
				</li>
			</ul>
		</ActionModal>
	);
}

/**
 * Retire, a Confirm modal with the filled danger confirm: retiring is
 * final, so the modal names what stops before the button does it.
 */
export function SkillRetireModal({
	skill,
	open,
	onOpenChange,
}: {
	skill: Skill;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const retire = useRetireSkill();
	return (
		<ActionModal
			open={open}
			onOpenChange={(next) => {
				if (!next) retire.reset();
				onOpenChange(next);
			}}
			size="confirm"
			title={`Retire ${skill.name}`}
			description="Retiring is final. A retired skill never returns to draft or approved."
			dirty={false}
			submitLabel="Retire skill"
			pendingLabel="Retiring"
			submitDisabledReason={retireBlocker(skill)}
			destructive
			pending={retire.isPending}
			error={retire.error}
			onSubmit={() =>
				retire.mutate(skill.id, {
					onSuccess: (saved) => {
						toast.success(`Retired ${saved.name}.`);
						onOpenChange(false);
					},
				})
			}
			changes={
				<WhatChanges
					data-testid="skill-retire-changes"
					changes={[
						{
							label: "Status",
							kind: "change",
							from: STATUS_LABEL[skill.status],
							to: STATUS_LABEL.retired,
						},
					]}
				/>
			}
			data-testid="skill-retire-modal"
		>
			<ul
				data-testid="skill-retire-effects"
				className="flex list-disc flex-col gap-1 pl-4 type-small text-foreground"
			>
				<li>It can't be attached to a role or a mission again.</li>
				<li>It can't be edited or approved.</li>
				<li>
					It stays in the library, read-only, under its source, and its source
					can't be removed while it is there.
				</li>
			</ul>
		</ActionModal>
	);
}
