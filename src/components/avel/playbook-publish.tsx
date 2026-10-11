import type { Playbook, UpdatePlaybookBody } from "avel-server/contract";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import type { ApiError } from "@/lib/api/errors";
import { useUpdatePlaybook } from "@/lib/api/playbooks";
import { ActionModal, useFieldIssues } from "./action-modal";
import { DELIVERABLE_LABEL, POLICY_LABEL } from "./playbook-list";
import { type PlaybookDraft, playbookBodyOf } from "./playbook-pipeline";
import { type Change, WhatChanges } from "./what-changes";

/*
 * Publishing a playbook (ruling 35's Confirm): the What-changes strip, the
 * whole body as it will be sent, one row per field, and a refusal's issues
 * on the row their path names. avel-server replaces the playbook and bumps
 * its version; the builder then starts again from the new version.
 */

export function PublishModal({
	open,
	onOpenChange,
	playbook,
	draft,
	changes,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	playbook: Playbook;
	draft: PlaybookDraft;
	changes: Change[];
}) {
	const update = useUpdatePlaybook(playbook.missionType, {
		onSaved: (saved) => {
			toast.success(`Published ${saved.missionType} v${saved.version}.`);
			onOpenChange(false);
		},
	});
	return (
		<PublishConfirm
			open={open}
			onOpenChange={(o) => {
				if (!o) update.reset();
				onOpenChange(o);
			}}
			playbook={playbook}
			draft={draft}
			changes={changes}
			pending={update.isPending}
			error={update.error}
			onSubmit={(body) => update.mutate(body)}
		/>
	);
}

/** The Confirm itself; the caller owns the request, so it tests directly. */
export function PublishConfirm({
	open,
	onOpenChange,
	playbook,
	draft,
	changes,
	pending,
	error,
	onSubmit,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	playbook: Playbook;
	draft: PlaybookDraft;
	changes: Change[];
	pending: boolean;
	error: ApiError | null;
	onSubmit: (body: UpdatePlaybookBody) => void;
}) {
	const body = playbookBodyOf(playbook, draft);
	const next = playbook.version + 1;
	return (
		<ActionModal
			open={open}
			onOpenChange={onOpenChange}
			size="confirm"
			title={`Publish ${playbook.missionType}`}
			description={`Replaces v${playbook.version} with v${next}. Missions of this type follow it from their next run.`}
			// The draft lives in the builder, not here: closing loses nothing.
			dirty={false}
			submitLabel={`Publish v${next}`}
			pendingLabel="Publishing"
			pending={pending}
			error={error}
			onSubmit={() => onSubmit(body)}
			changes={
				<WhatChanges changes={changes} data-testid="playbook-publish-changes" />
			}
			data-testid="playbook-publish-modal"
		>
			<dl className="flex flex-col gap-2">
				<BodyRow name="name" label="Name">
					{body.name}
				</BodyRow>
				<BodyRow name="wavesApplicable" label="Waves">
					<span className="type-mono-small">
						{body.wavesApplicable.length === 0
							? "None"
							: body.wavesApplicable.join(" ")}
					</span>
				</BodyRow>
				<BodyRow name="gates" label="Gates">
					{body.gates.length === 0 ? (
						"None"
					) : (
						<span className="flex flex-wrap gap-1">
							{body.gates.map((g) => (
								<Badge key={g.gate} variant="tag">
									{`${g.gate} ${POLICY_LABEL[g.policy].toLowerCase()}`}
								</Badge>
							))}
						</span>
					)}
				</BodyRow>
				<BodyRow name="deliverable" label="Deliverable">
					{DELIVERABLE_LABEL[body.deliverable]}
				</BodyRow>
				<BodyRow name="requiredFields" label="Required fields">
					<span className="type-mono-small">
						{body.requiredFields.length === 0
							? "None"
							: body.requiredFields.join(", ")}
					</span>
				</BodyRow>
				<BodyRow name="defaultPresetId" label="Default preset">
					<span className="type-mono-small" title={body.defaultPresetId}>
						{body.defaultPresetId.slice(0, 8)}
					</span>
				</BodyRow>
			</dl>
		</ActionModal>
	);
}

/** One field of the body, with the refusal's issues for it beneath. */
function BodyRow({
	name,
	label,
	children,
}: {
	name: string;
	label: string;
	children: ReactNode;
}) {
	const issues = useFieldIssues(name);
	return (
		<div
			data-testid={`playbook-publish-row-${name}`}
			data-invalid={issues.length > 0 || undefined}
			className="grid grid-cols-[8rem_minmax(0,1fr)] gap-x-3 gap-y-0.5"
		>
			<dt className="type-caption text-text-subtle">{label}</dt>
			<dd className="min-w-0 type-small text-foreground">{children}</dd>
			{issues.length > 0 ? (
				<p
					data-testid={`playbook-publish-issue-${name}`}
					className="col-start-2 type-small text-gate-block"
				>
					{issues.join(" ")}
				</p>
			) : null}
		</div>
	);
}
