import type {
	InfiniteData,
	UseInfiniteQueryResult,
} from "@tanstack/react-query";
import type { RepoPolicy } from "avel-server/contract";
import { GitBranch, Plus } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import type { ApiError } from "@/lib/api";
import type { ExportTarget } from "@/lib/api/exports";
import {
	loadedRepoPolicies,
	normalizeRepoUrl,
	type RepoPoliciesPage,
	type SetRepoPolicyBody,
	useSetRepoPolicy,
} from "@/lib/api/repo-policies";
import { linkFor } from "../../shell/nav";
import { ActionModal, type IssuePath, ModalField } from "./action-modal";
import { EmptyState } from "./empty-state";
import { OptionCards } from "./option-cards";
import { EXPORT_TARGET_LABEL, StatusPill } from "./status-pill";
import { ErrorState, Surface } from "./surface";
import { useOpenGeneration } from "./use-open-generation";

/*
 * Settings, Repositories (module 11): what each repository allows. A card
 * per policy, newest first: whether a push may go straight to its default
 * branch, and the delivery an export starts on. A repository with no policy
 * never takes a direct push to its default branch, so only the permissive
 * case is a row. Allowing that push asks for its own confirmation, which
 * the server requires too (confirmDirectPush).
 */

type PoliciesQuery = UseInfiniteQueryResult<
	InfiniteData<RepoPoliciesPage>,
	ApiError
>;

export function RepoPolicyBoard({
	query,
	onNew,
	onEdit,
}: {
	query: PoliciesQuery;
	onNew: () => void;
	onEdit: (policy: RepoPolicy) => void;
}) {
	return (
		<Surface
			data-testid="repo-policy-list"
			query={query}
			isEmpty={(data) => loadedRepoPolicies(data).length === 0}
			loading={
				<div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
					{[0, 1, 2].map((n) => (
						<Skeleton key={n} className="h-36 rounded-card" />
					))}
				</div>
			}
			empty={
				<div className="p-4">
					<EmptyState
						data-testid="repo-policies-empty"
						icon={linkFor("/settings/repositories").icon}
						title="No repository policies"
						description="Every repository is on the safe default: no direct push to its default branch. Add a policy only for a repository that should allow more."
						action={
							<Button
								size="sm"
								data-testid="repo-policies-empty-new"
								onClick={onNew}
							>
								<Plus aria-hidden="true" />
								New policy
							</Button>
						}
					/>
				</div>
			}
			error={(props) => (
				<div className="p-4">
					<ErrorState {...props} />
				</div>
			)}
		>
			{(data) => (
				<ul className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
					{loadedRepoPolicies(data).map((policy) => (
						<li key={policy.id}>
							<RepoPolicyCard policy={policy} onEdit={onEdit} />
						</li>
					))}
				</ul>
			)}
		</Surface>
	);
}

/** "owner/repo", from a stored https://github.com/owner/repo. */
export function repoName(url: string): string {
	return url.replace(/^https:\/\/github\.com\//, "");
}

export function RepoPolicyCard({
	policy,
	onEdit,
}: {
	policy: RepoPolicy;
	onEdit: (policy: RepoPolicy) => void;
}) {
	const name = repoName(policy.repoUrl);
	return (
		<article
			aria-label={policy.label ?? name}
			data-testid={`repo-policy-card-${policy.id}`}
			className="flex h-full min-w-0 flex-col gap-3 rounded-card border border-border bg-app-panel p-4 shadow-card"
		>
			<header className="flex items-start gap-3">
				<span
					aria-hidden="true"
					className="inline-grid size-tile-md shrink-0 place-items-center rounded-tile border border-border bg-app-panel text-text-muted"
				>
					<GitBranch className="size-4" />
				</span>
				<span className="flex min-w-0 flex-1 flex-col">
					<h3 className="truncate type-title text-text" title={policy.repoUrl}>
						<button
							type="button"
							aria-haspopup="dialog"
							data-testid={`repo-policy-open-${policy.id}`}
							className="max-w-full cursor-pointer truncate text-left underline decoration-transparent underline-offset-2 transition-colors duration-(--duration-micro) ease-avel hover:decoration-current"
							onClick={() => onEdit(policy)}
						>
							{policy.label ?? name}
						</button>
					</h3>
					{policy.label ? (
						<span className="truncate type-mono text-text-subtle">{name}</span>
					) : null}
				</span>
				<StatusPill
					size="sm"
					tone={policy.allowDirectPushToDefault ? "warn" : "pass"}
					label={
						policy.allowDirectPushToDefault
							? "Direct push allowed"
							: "No direct push"
					}
					data-testid={`repo-policy-push-${policy.id}`}
				/>
			</header>
			<dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 type-small">
				<dt className="text-text-subtle">Default branch</dt>
				<dd className="text-text">
					{policy.allowDirectPushToDefault
						? "A push may go straight to it"
						: "Pushes go to another branch or a pull request"}
				</dd>
				<dt className="text-text-subtle">Delivers by</dt>
				<dd
					data-testid={`repo-policy-target-${policy.id}`}
					className="text-text"
				>
					{policy.defaultTarget
						? EXPORT_TARGET_LABEL[policy.defaultTarget]
						: "No default"}
				</dd>
			</dl>
		</article>
	);
}

/** The default target's choices: none, or one of the export targets. */
type TargetChoice = ExportTarget | "none";

const TARGET_CHOICES: readonly { value: TargetChoice; title: string }[] = [
	{ value: "none", title: "No default" },
	{ value: "zip", title: EXPORT_TARGET_LABEL.zip },
	{ value: "github_pr", title: EXPORT_TARGET_LABEL.github_pr },
	{ value: "github_push", title: EXPORT_TARGET_LABEL.github_push },
];

type Draft = {
	repoUrl: string;
	label: string;
	target: TargetChoice;
	allowPush: boolean;
	confirmed: boolean;
};

const draftOf = (policy: RepoPolicy | null): Draft => ({
	repoUrl: policy?.repoUrl ?? "",
	label: policy?.label ?? "",
	target: policy?.defaultTarget ?? "none",
	allowPush: policy?.allowDirectPushToDefault ?? false,
	confirmed: false,
});

/**
 * What Save sends. The label and default target are sent every time, null
 * when cleared, because an omitted one keeps its earlier value. The
 * confirmation goes only with a push that was off and is being turned on.
 */
export function repoPolicyBody(
	draft: Draft,
	before: RepoPolicy | null,
): SetRepoPolicyBody {
	const turningOn =
		draft.allowPush && !(before?.allowDirectPushToDefault ?? false);
	return {
		repoUrl: normalizeRepoUrl(draft.repoUrl) ?? draft.repoUrl.trim(),
		label: draft.label.trim() === "" ? null : draft.label.trim(),
		allowDirectPushToDefault: draft.allowPush,
		defaultTarget: draft.target === "none" ? null : draft.target,
		...(turningOn && draft.confirmed
			? { confirmDirectPush: true as const }
			: {}),
	};
}

const POLICY_FIELDS = ["repoUrl", "label", "defaultTarget"] as const;
const policyFieldOf = (path: IssuePath): string | null =>
	(POLICY_FIELDS as readonly unknown[]).includes(path[0])
		? (path[0] as string)
		: null;

/** New policy, or one policy's edit: open while `policy` is set or `creating`. */
export function RepoPolicyModal({
	open,
	policy,
	onOpenChange,
}: {
	open: boolean;
	/** The policy being edited; null for a new one. */
	policy: RepoPolicy | null;
	onOpenChange: (open: boolean) => void;
}) {
	const set = useSetRepoPolicy();
	const generation = useOpenGeneration(open);
	return (
		<RepoPolicyForm
			key={`${policy?.id ?? "new"}:${generation}`}
			open={open}
			policy={policy}
			pending={set.isPending}
			error={set.error}
			onOpenChange={(next) => {
				if (!next) set.reset();
				onOpenChange(next);
			}}
			onSubmit={(body) =>
				set.mutate(body, {
					onSuccess: (saved) => {
						toast.success(`Saved the policy for ${repoName(saved.repoUrl)}.`);
						onOpenChange(false);
					},
				})
			}
		/>
	);
}

export function RepoPolicyForm({
	open = true,
	policy,
	pending,
	error,
	onOpenChange = () => {},
	onSubmit,
}: {
	open?: boolean;
	policy: RepoPolicy | null;
	pending: boolean;
	error: ApiError | null;
	onOpenChange?: (open: boolean) => void;
	onSubmit: (body: SetRepoPolicyBody) => void;
}) {
	const [draft, setDraft] = useState<Draft>(() => draftOf(policy));
	const confirmId = useId();
	const pushId = useId();
	const start = draftOf(policy);
	const dirty = JSON.stringify(draft) !== JSON.stringify(start);
	const turningOn =
		draft.allowPush && !(policy?.allowDirectPushToDefault ?? false);
	const repoOk = normalizeRepoUrl(draft.repoUrl) !== null;
	const name = repoOk ? repoName(normalizeRepoUrl(draft.repoUrl) ?? "") : null;
	const reason = !repoOk
		? "Give a GitHub repository: https://github.com/owner/repo"
		: turningOn && !draft.confirmed
			? "Confirm the direct push first"
			: !dirty
				? "Nothing has changed"
				: undefined;
	return (
		<ActionModal
			open={open}
			onOpenChange={onOpenChange}
			size="form"
			title={policy ? `Policy for ${repoName(policy.repoUrl)}` : "New policy"}
			description="What this repository allows when AVEL delivers to it. Without a policy, a push never goes straight to its default branch."
			dirty={dirty}
			submitLabel="Save policy"
			pendingLabel="Saving"
			submitDisabledReason={reason}
			onSubmit={() => onSubmit(repoPolicyBody(draft, policy))}
			pending={pending}
			error={error}
			fieldOf={policyFieldOf}
			data-testid="repo-policy-form"
		>
			<ModalField
				name="repoUrl"
				label="Repository"
				hint={policy ? "A policy stays with its repository" : "GitHub"}
				testid="repo-policy-form-repo"
			>
				{(props) => (
					<Input
						{...props}
						className="type-mono"
						placeholder="https://github.com/owner/repo"
						value={draft.repoUrl}
						disabled={policy !== null}
						onChange={(e) => setDraft({ ...draft, repoUrl: e.target.value })}
					/>
				)}
			</ModalField>
			<ModalField
				name="label"
				label="Name"
				hint="Optional"
				testid="repo-policy-form-label"
			>
				{(props) => (
					<Input
						{...props}
						maxLength={200}
						placeholder="Meridian app"
						value={draft.label}
						onChange={(e) => setDraft({ ...draft, label: e.target.value })}
					/>
				)}
			</ModalField>
			<OptionCards
				legend="Delivers by default"
				value={draft.target}
				onChange={(target) => setDraft({ ...draft, target })}
				columns={2}
				data-testid="repo-policy-form-target"
				options={TARGET_CHOICES.map((c) => ({
					value: c.value,
					title: c.title,
					"data-testid": `repo-policy-form-target-${c.value}`,
				}))}
			/>
			<div className="flex flex-col gap-2 rounded-control border border-border p-3">
				<div className="flex items-center gap-3">
					<Switch
						id={pushId}
						checked={draft.allowPush}
						data-testid="repo-policy-form-push"
						onCheckedChange={(allowPush) =>
							setDraft({ ...draft, allowPush, confirmed: false })
						}
					/>
					<label htmlFor={pushId} className="type-small font-medium text-text">
						Allow a direct push to the default branch
					</label>
				</div>
				<p className="type-caption text-text-muted">
					Off, a push goes to another branch and the default branch changes only
					through a pull request.
				</p>
				{turningOn ? (
					<div
						data-testid="repo-policy-form-confirm"
						className="flex items-start gap-2 rounded-control border border-gate-warn-line bg-gate-warn-soft p-2.5"
					>
						<Checkbox
							id={confirmId}
							checked={draft.confirmed}
							data-testid="repo-policy-form-confirm-check"
							onCheckedChange={(on) =>
								setDraft({ ...draft, confirmed: on === true })
							}
						/>
						<label htmlFor={confirmId} className="type-small text-text">
							{`I understand a delivery to ${name ?? "this repository"} may write straight to its default branch, with no pull request to review first.`}
						</label>
					</div>
				) : null}
			</div>
		</ActionModal>
	);
}
