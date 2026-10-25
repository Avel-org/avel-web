import type { ExportWire } from "avel-server/contract";
import { useEffect, useId } from "react";
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
import type {
	CreateExportBody,
	ExportTarget,
	PreviewExportBody,
} from "@/lib/api/exports";
import { useActiveConnectionsFor } from "@/lib/api/intakes";
import {
	loadedRepoPolicies,
	policyFor,
	useRepoPolicies,
} from "@/lib/api/repo-policies";

/*
 * Where an export goes, on the pre-flight screen: a zip, a GitHub pull
 * request onto a base branch, or a push to a branch, each GitHub target
 * through one of the engagement's connections (the repository's default
 * branch when left blank). A push to the default branch needs the
 * repository's policy to allow it (2026-10-24); the preview records the
 * block when it does not. Delivery sends what the preview recorded, so a
 * choice changed since the preview has to be previewed again first.
 */

export const TARGETS = [
	{ id: "zip", label: "Zip" },
	{ id: "github_pr", label: "GitHub PR" },
	{ id: "github_push", label: "GitHub push" },
] as const satisfies readonly { id: ExportTarget; label: string }[];

/** The target, connection and base branch as chosen; text stays text. */
export type TargetChoice = {
	target: ExportTarget;
	connectionId: string;
	ref: string;
};

export const ZIP_CHOICE: TargetChoice = {
	target: "zip",
	connectionId: "",
	ref: "",
};

/** The choice a preview was made with, to start from. */
export function choiceOf(exp: ExportWire | null): TargetChoice {
	if (exp === null) return ZIP_CHOICE;
	return {
		target: exp.targetKind,
		connectionId: exp.connectionId ?? "",
		ref: exp.baseRef ?? "",
	};
}

/**
 * Why a target can't be chosen for this mission, or null when it can. The
 * engagement is undefined while the mission reads, null on an internal one.
 */
export function targetOffReason(
	target: ExportTarget,
	engagementId: string | null | undefined,
): string | null {
	if (target === "zip") return null;
	if (engagementId === undefined) return "Reading the mission";
	if (engagementId === null)
		return "Only a client mission has a repository to deliver to";
	return null;
}

/** Why Preview can't run on this choice yet, or null when it can. */
export function choiceProblem(choice: TargetChoice): string | null {
	return choice.target !== "zip" && choice.connectionId === ""
		? "Choose a connection"
		: null;
}

/** The preview request for a choice. */
export function previewBodyOf(
	missionId: string,
	choice: TargetChoice,
): PreviewExportBody {
	if (choice.target === "zip") return { missionId, target: "zip" };
	const ref = choice.ref.trim();
	return {
		missionId,
		target: choice.target,
		connectionId: choice.connectionId,
		...(ref === "" ? {} : { ref }),
	};
}

/**
 * The delivery of a preview: its own target, connection and branch, so what
 * ships is what was checked. Null for a preview that stopped before it
 * rendered: it names no gate run, so there is nothing to deliver.
 */
export function deliverBodyOf(preview: ExportWire): CreateExportBody | null {
	if (preview.gateRun === null) return null;
	const linked = {
		missionId: preview.missionId,
		gateRunId: preview.gateRun.id,
		previewExportId: preview.id,
	};
	if (preview.targetKind === "zip") return { ...linked, target: "zip" };
	return {
		...linked,
		target: preview.targetKind,
		...(preview.connectionId ? { connectionId: preview.connectionId } : {}),
		...(preview.baseRef ? { ref: preview.baseRef } : {}),
	};
}

/**
 * Whether the choice differs from what the preview was made with. A blank
 * branch matches whichever branch the preview resolved to.
 */
export function choiceChanged(
	choice: TargetChoice,
	preview: ExportWire | null,
): boolean {
	if (preview === null) return false;
	if (choice.target !== preview.targetKind) return true;
	if (choice.target === "zip") return false;
	const ref = choice.ref.trim();
	return (
		choice.connectionId !== (preview.connectionId ?? "") ||
		(ref !== "" && ref !== preview.baseRef)
	);
}

/** The target segments, and a GitHub target's connection and branch. */
export function TargetPicker({
	choice,
	onChange,
	engagementId,
	repoUrl = null,
}: {
	choice: TargetChoice;
	onChange: (choice: TargetChoice) => void;
	/** The mission's engagement, whose connections a GitHub target uses; undefined while it reads. */
	engagementId: string | null | undefined;
	/** The mission's repository, whose policy a push reads. */
	repoUrl?: string | null;
}) {
	return (
		<div className="flex flex-col gap-3">
			<fieldset
				data-testid="export-target"
				className={tabsListVariants({ variant: "default" })}
			>
				<legend className="sr-only">Target</legend>
				{TARGETS.map((t) => (
					<Button
						key={t.id}
						type="button"
						variant="segment"
						aria-pressed={t.id === choice.target}
						data-testid={`export-target-${t.id}`}
						disabledReason={targetOffReason(t.id, engagementId) ?? undefined}
						onClick={() => onChange({ ...choice, target: t.id })}
					>
						{t.label}
					</Button>
				))}
			</fieldset>
			{choice.target !== "zip" && engagementId ? (
				<GitHubFields
					choice={choice}
					onChange={onChange}
					engagementId={engagementId}
				/>
			) : null}
			{choice.target === "github_push" ? (
				<PushPolicyLine repoUrl={repoUrl} />
			) : null}
		</div>
	);
}

/** A pull request's connection, the engagement's first by default, and base branch. */
function GitHubFields({
	choice,
	onChange,
	engagementId,
}: {
	choice: TargetChoice;
	onChange: (choice: TargetChoice) => void;
	engagementId: string;
}) {
	const id = useId();
	const connections = useActiveConnectionsFor(engagementId);
	const choices = connections.data ?? [];
	const first = choices[0]?.id;
	// No connection chosen yet: the engagement's first, once they are read.
	useEffect(() => {
		if (choice.connectionId === "" && first)
			onChange({ ...choice, connectionId: first });
	}, [choice, first, onChange]);
	return (
		<div className="grid gap-3 sm:grid-cols-2">
			<div className="flex min-w-0 flex-col gap-1.5">
				<label
					htmlFor={`${id}-connection`}
					className="type-small font-medium text-text"
				>
					Connection
				</label>
				<Select
					value={choice.connectionId}
					onValueChange={(connectionId) =>
						onChange({ ...choice, connectionId })
					}
				>
					<SelectTrigger
						id={`${id}-connection`}
						data-testid="export-connection"
						className="w-full"
						disabledReason={
							connections.status === "pending"
								? "Reading this engagement's connections"
								: choices.length === 0
									? "This engagement has no active connection. Add one in Settings, Connections."
									: undefined
						}
					>
						<SelectValue placeholder="No active connection" />
					</SelectTrigger>
					<SelectContent>
						{choices.map((c) => (
							<SelectItem key={c.id} value={c.id}>
								{c.label}
								<span className="type-mono text-text-subtle">
									{c.scopeValue}
								</span>
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>
			<div className="flex min-w-0 flex-col gap-1.5">
				<label
					htmlFor={`${id}-ref`}
					className="type-small font-medium text-text"
				>
					{choice.target === "github_push" ? "Branch" : "Base branch"}
				</label>
				<Input
					id={`${id}-ref`}
					data-testid="export-ref"
					autoComplete="off"
					spellCheck={false}
					placeholder="The repository's default branch"
					value={choice.ref}
					onChange={(e) => onChange({ ...choice, ref: e.target.value })}
				/>
			</div>
		</div>
	);
}

/**
 * Whether this repository takes a direct push to its default branch: its
 * policy's word, or the safe default when it has none. The preview records
 * the block either way; this says so before it runs.
 */
export function PushPolicyLine({ repoUrl }: { repoUrl: string | null }) {
	const policies = useRepoPolicies();
	const policy = policyFor(loadedRepoPolicies(policies.data), repoUrl);
	const allowed = policy?.allowDirectPushToDefault ?? false;
	return (
		<p
			data-testid="export-push-policy"
			data-allowed={allowed}
			className="type-small text-text-muted"
		>
			{policies.status === "pending"
				? "Reading this repository's policy."
				: allowed
					? "This repository's policy allows a push straight to its default branch."
					: policy
						? "This repository's policy doesn't allow a push to its default branch: name another branch."
						: "This repository has no policy, so a push can't go to its default branch: name another branch, or allow it in Settings, Repositories."}
		</p>
	);
}
