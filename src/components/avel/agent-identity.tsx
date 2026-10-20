import {
	type AgentTemplate,
	type IdentityInputs,
	type IdentityVersionSummary,
	ROLE_RUNNER,
} from "avel-server/contract";
import { GitCompare, RefreshCw, Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api";
import {
	useIdentityVersion,
	useIdentityVersions,
	useRegenerateIdentity,
} from "@/lib/api/catalog";
import { cn } from "@/lib/utils";
import { ActionModal, DetailModal } from "./action-modal";
import {
	IdentityText,
	INPUT_WORDS,
	staleLine,
} from "./catalog-agent-inspector";
import { EmptyState } from "./empty-state";
import { ShortHash } from "./short-hash";
import { ErrorState, Surface } from "./surface";
import { type Change, WhatChanges } from "./what-changes";

/*
 * An agent's identity versions (module 5, step 5): Regenerate on the
 * Identity panel, and the live list of versions with each one's text and a
 * diff between any two. Versions are never changed or deleted, so nothing
 * here edits one; Regenerate writes a new one only when the text differs.
 */

// ---------------------------------------------------------------------------
// Pure pieces, tested directly.

/** A role run by a person (the operator): it has no identity to generate. */
export const isPerson = (agent: Pick<AgentTemplate, "roles">) =>
	agent.roles.some((role) => ROLE_RUNNER[role] === "human");

export const PERSON_REASON = "The operator is a person, so it has no identity.";

/** What regenerate's answer means, in one line for its toast. */
export type RegenerateResult =
	| { created: true; version: IdentityVersionSummary }
	| { created: false; reused: boolean; version: IdentityVersionSummary };

export function regenerateOutcome(result: RegenerateResult): string {
	const { ref } = result.version;
	if (result.created) return `Generated ${ref}`;
	return result.reused
		? `No change: the identity matches the earlier version ${ref}, which is already in force.`
		: `No change: the identity already matches ${ref}`;
}

/**
 * The size line for an over-cap refusal, from the response's own details:
 * "identity.md is 1,350 tokens; its limit is 1,200." Null for anything else.
 */
export function overCapLine(error: unknown): string | null {
	if (!(error instanceof ApiError)) return null;
	const { failure } = error;
	if (failure.kind !== "contract" || failure.code !== "PRECONDITION_FAILED")
		return null;
	const { reason, file, tokens, cap } = failure.details;
	if (reason !== "identity_over_token_cap" || tokens === undefined) return null;
	const name = file === "depth" ? "depth.md" : "identity.md";
	const n = (v: number) => v.toLocaleString("en-US");
	return cap === undefined
		? `${name} is ${n(tokens)} tokens.`
		: `${name} is ${n(tokens)} tokens; its limit is ${n(cap)}.`;
}

/** Who wrote a version: the seed, you, or another operator. */
export function generatedByLabel(
	generatedBy: string | null,
	me: string | undefined,
): string {
	if (generatedBy === null) return "Seed";
	return generatedBy === me ? "You" : "An operator";
}

export type DiffLine = { kind: "same" | "add" | "remove"; text: string };

/**
 * A line diff from `before` to `after`, by longest common subsequence: the
 * lines both keep, then what was removed and added around them, in order.
 */
export function lineDiff(before: string, after: string): DiffLine[] {
	const a = before.split("\n");
	const b = after.split("\n");
	// lcs[i][j]: the common length of a[i..] and b[j..].
	const lcs = Array.from({ length: a.length + 1 }, () =>
		new Array<number>(b.length + 1).fill(0),
	);
	for (let i = a.length - 1; i >= 0; i--) {
		for (let j = b.length - 1; j >= 0; j--) {
			const row = lcs[i] as number[];
			row[j] =
				a[i] === b[j]
					? (lcs[i + 1]?.[j + 1] ?? 0) + 1
					: Math.max(lcs[i + 1]?.[j] ?? 0, row[j + 1] ?? 0);
		}
	}
	const out: DiffLine[] = [];
	let i = 0;
	let j = 0;
	while (i < a.length && j < b.length) {
		if (a[i] === b[j]) {
			out.push({ kind: "same", text: a[i] as string });
			i++;
			j++;
		} else if ((lcs[i + 1]?.[j] ?? 0) >= (lcs[i]?.[j + 1] ?? 0)) {
			out.push({ kind: "remove", text: a[i] as string });
			i++;
		} else {
			out.push({ kind: "add", text: b[j] as string });
			j++;
		}
	}
	for (; i < a.length; i++) out.push({ kind: "remove", text: a[i] as string });
	for (; j < b.length; j++) out.push({ kind: "add", text: b[j] as string });
	return out;
}

const shownInput = (inputs: IdentityInputs, key: keyof IdentityInputs) => {
	const value = inputs[key];
	if (key === "skills")
		return inputs.skills
			.map((s) => `${s.id.slice(0, 7)}@${s.contentSha256.slice(0, 7)}`)
			.join(", ");
	if (Array.isArray(value)) return value.join(", ");
	return key === "definitionsSha256"
		? String(value).slice(0, 7)
		: String(value);
};

/** Which inputs differ between two versions, each named in plain words. */
export function inputChanges(
	before: IdentityInputs,
	after: IdentityInputs,
): Change[] {
	return (Object.keys(INPUT_WORDS) as (keyof typeof INPUT_WORDS)[])
		.filter((key) => shownInput(before, key) !== shownInput(after, key))
		.map((key) => ({
			label: INPUT_WORDS[key].replace(/^(its|the) /, ""),
			kind: "change" as const,
			from: shownInput(before, key) || "none",
			to: shownInput(after, key) || "none",
			mono: key !== "name" && key !== "kind",
		}));
}

// ---------------------------------------------------------------------------
// Regenerate.

/**
 * Generate on the Identity panel's header: a Confirm with what it does.
 * It reads Generate until a first version exists, then Regenerate, and is
 * the primary button while there is something to write (none yet, or out of
 * date). The operator's template holds a person's role, so the button says
 * why it is held instead of opening.
 */
export function RegenerateIdentity({ agent }: { agent: AgentTemplate }) {
	const [open, setOpen] = useState(false);
	const regenerate = useRegenerateIdentity();
	const person = isPerson(agent);
	const first = agent.identityVersion === null;
	const verb = first ? "Generate" : "Regenerate";
	const due = !person && (first || agent.identityStale);
	const changes: Change[] =
		agent.identityVersion === null
			? [
					{
						label: "Identity",
						kind: "add",
						to: "Its first version, written from its roles",
					},
				]
			: [
					{
						label: "Identity",
						kind: "change",
						from: `v${agent.identityVersion}`,
						to: agent.identityStale
							? "A new version, from its current inputs"
							: "No new version: its inputs have not changed",
					},
				];
	const submit = () =>
		regenerate.mutate(agent.id, {
			onSuccess: (result) => {
				setOpen(false);
				if (result.created) toast.success(regenerateOutcome(result));
				else toast(regenerateOutcome(result));
			},
		});
	const overCap = overCapLine(regenerate.error);
	return (
		<>
			<Button
				size="sm"
				variant={due ? "default" : "outline"}
				data-testid="agent-identity-regenerate"
				data-due={due || undefined}
				disabledReason={person ? PERSON_REASON : undefined}
				onClick={() => {
					regenerate.reset();
					setOpen(true);
				}}
			>
				{first ? (
					<Sparkles aria-hidden="true" />
				) : (
					<RefreshCw aria-hidden="true" />
				)}
				{first ? "Generate identity" : "Regenerate"}
			</Button>
			<ActionModal
				open={open}
				onOpenChange={setOpen}
				size="confirm"
				title={`${verb} ${agent.name}'s identity`}
				description="The identity generator writes it again from the agent's roles, skills and settings. A new version is kept only when the text differs; no version is ever changed or deleted."
				dirty={false}
				submitLabel={verb}
				pendingLabel={first ? "Generating" : "Regenerating"}
				onSubmit={submit}
				pending={regenerate.isPending}
				error={regenerate.error}
				changes={
					<WhatChanges
						data-testid="agent-identity-regenerate-changes"
						changes={changes}
					/>
				}
				data-testid="agent-identity-regenerate-modal"
			>
				{agent.identityStale && agent.identityVersion !== null ? (
					<p
						data-testid="agent-identity-regenerate-stale"
						className="type-small text-text-muted"
					>
						{staleLine(`v${agent.identityVersion}`, agent.staleInputs)}
					</p>
				) : null}
				{overCap ? (
					<p
						data-testid="agent-identity-regenerate-over-cap"
						className="type-mono text-gate-block"
					>
						{overCap}
					</p>
				) : null}
			</ActionModal>
		</>
	);
}

// ---------------------------------------------------------------------------
// Versions.

/**
 * Every identity version, newest first: its ref, hash, token counts, who
 * wrote it and when, the one in force marked. A row opens its text; two
 * chosen rows open a diff.
 */
export function IdentityVersions({
	agent,
	me,
}: {
	agent: AgentTemplate;
	/** The signed-in operator's id, so their own versions read "You". */
	me: string | undefined;
}) {
	const query = useIdentityVersions(agent.id);
	return (
		<Surface
			data-testid="agent-identity-versions-surface"
			query={query}
			isEmpty={(rows) => rows.length === 0}
			loading={
				<div
					data-testid="agent-identity-versions-skeleton"
					className="flex flex-col gap-2"
				>
					<Skeleton className="h-10 w-full" />
					<Skeleton className="h-10 w-full" />
				</div>
			}
			empty={
				<EmptyState
					data-testid="agent-identity-versions-empty"
					compact
					icon={RefreshCw}
					title="No versions yet"
					description="A version is kept each time the identity is generated with new text."
				/>
			}
			error={ErrorState}
		>
			{(rows) => <VersionList agent={agent} rows={rows} me={me} />}
		</Surface>
	);
}

export function VersionList({
	agent,
	rows,
	me,
}: {
	agent: Pick<
		AgentTemplate,
		"id" | "name" | "identityVersion" | "identityStale" | "staleInputs"
	>;
	rows: readonly IdentityVersionSummary[];
	me: string | undefined;
}) {
	const [opened, setOpened] = useState<IdentityVersionSummary | null>(null);
	const [picked, setPicked] = useState<number[]>([]);
	const [comparing, setComparing] = useState(false);
	const toggle = (n: number) =>
		setPicked((now) =>
			now.includes(n) ? now.filter((x) => x !== n) : [...now, n].slice(-2),
		);
	// Older first, so the diff reads from what was to what is.
	const [from, to] = [...picked].sort((x, y) => x - y);
	return (
		<div className="flex flex-col gap-3">
			<ol
				aria-label="Identity versions"
				data-testid="agent-identity-versions"
				className="flex flex-col divide-y divide-border"
			>
				{rows.map((v) => {
					const current = v.number === agent.identityVersion;
					return (
						<li
							key={v.number}
							data-testid={`agent-identity-version-${v.number}`}
							data-current={current || undefined}
							className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2"
						>
							<Checkbox
								checked={picked.includes(v.number)}
								onCheckedChange={() => toggle(v.number)}
								aria-label={`Compare ${v.ref}`}
								data-testid={`agent-identity-version-${v.number}-pick`}
							/>
							<Button
								variant="link"
								size="sm"
								data-testid={`agent-identity-version-${v.number}-open`}
								aria-label={`Read ${v.ref}`}
								onClick={() => setOpened(v)}
								className="h-auto px-0 type-mono"
							>
								{v.ref}
							</Button>
							{current ? (
								<span
									data-testid="agent-identity-version-current"
									className="type-caption text-accent-text"
								>
									(current)
								</span>
							) : null}
							<ShortHash
								value={v.sha256}
								label={`the hash of ${v.ref}`}
								data-testid={`agent-identity-version-${v.number}-sha`}
							/>
							<span className="type-mono text-text-subtle tabular-nums">
								{`${v.identityTokens} + ${v.depthTokens} tokens`}
							</span>
							<span className="ml-auto flex items-baseline gap-3 type-caption text-text-subtle">
								<span data-testid={`agent-identity-version-${v.number}-by`}>
									{generatedByLabel(v.generatedBy, me)}
								</span>
								<time dateTime={v.createdAt} className="type-mono tabular-nums">
									{v.createdAt.slice(0, 10)}
								</time>
							</span>
						</li>
					);
				})}
			</ol>
			<Button
				size="sm"
				variant="outline"
				className="self-start"
				data-testid="agent-identity-compare"
				disabledReason={
					picked.length < 2 ? "Choose two versions to compare." : undefined
				}
				onClick={() => setComparing(true)}
			>
				<GitCompare aria-hidden="true" />
				{from !== undefined && to !== undefined
					? `Compare v${from} with v${to}`
					: "Compare"}
			</Button>
			{opened ? (
				<DetailModal
					open
					onOpenChange={(next) => (next ? undefined : setOpened(null))}
					title={opened.ref}
					description={`${agent.name}'s identity as it was written in ${opened.ref}.`}
					data-testid="agent-identity-version-modal"
				>
					<VersionText agent={agent} number={opened.number} />
				</DetailModal>
			) : null}
			{comparing && from !== undefined && to !== undefined ? (
				<DetailModal
					open
					onOpenChange={(next) => (next ? undefined : setComparing(false))}
					title={`v${from} to v${to}`}
					description="What changed in the text, and which inputs moved."
					data-testid="agent-identity-diff-modal"
				>
					<VersionDiff agentId={agent.id} from={from} to={to} />
				</DetailModal>
			) : null}
		</div>
	);
}

function VersionText({
	agent,
	number,
}: {
	agent: Pick<AgentTemplate, "id" | "name">;
	number: number;
}) {
	const query = useIdentityVersion(agent.id, number);
	return (
		<Surface
			data-testid="agent-identity-version-text"
			query={query}
			isEmpty={() => false}
			loading={<Skeleton className="h-40 w-full rounded-control" />}
			empty={null}
			error={ErrorState}
		>
			{(version) => (
				// An old version is never stale: it is what it was.
				<IdentityText
					agent={{ name: agent.name, identityStale: false, staleInputs: [] }}
					version={version}
				/>
			)}
		</Surface>
	);
}

const DIFF_TONE: Record<DiffLine["kind"], string> = {
	same: "text-text-muted",
	add: "bg-gate-pass-soft text-foreground",
	remove: "bg-gate-block-soft text-foreground",
};

const DIFF_MARK: Record<DiffLine["kind"], string> = {
	same: " ",
	add: "+",
	remove: "-",
};

function VersionDiff({
	agentId,
	from,
	to,
}: {
	agentId: string;
	from: number;
	to: number;
}) {
	const before = useIdentityVersion(agentId, from);
	const after = useIdentityVersion(agentId, to);
	if (before.status === "error" || after.status === "error") {
		const failed = before.status === "error" ? before : after;
		return (
			<ErrorState
				error={failed.error as ApiError}
				retry={() => failed.refetch()}
				retrying={failed.isFetching}
			/>
		);
	}
	if (before.status !== "success" || after.status !== "success")
		return (
			<Skeleton
				data-testid="agent-identity-diff-skeleton"
				className="h-40 w-full rounded-control"
			/>
		);
	return <DiffBody before={before.data} after={after.data} />;
}

export function DiffBody({
	before,
	after,
}: {
	before: { identityMd: string; depthMd: string; inputs: IdentityInputs };
	after: { identityMd: string; depthMd: string; inputs: IdentityInputs };
}) {
	return (
		<div data-testid="agent-identity-diff" className="flex flex-col gap-4">
			<WhatChanges
				data-testid="agent-identity-diff-inputs"
				changes={inputChanges(before.inputs, after.inputs)}
				empty="No input moved: only the generator's output differs."
			/>
			{(
				[
					["identity.md", before.identityMd, after.identityMd],
					["depth.md", before.depthMd, after.depthMd],
				] as const
			).map(([file, a, b]) => (
				<section
					key={file}
					aria-label={`Changes to ${file}`}
					className="flex flex-col gap-1"
				>
					<h3 className="type-caption text-text-subtle">{file}</h3>
					<pre
						data-testid={`agent-identity-diff-${file.replace(".md", "")}`}
						className="app-scroll overflow-x-auto rounded-xs border border-border bg-app-well py-2 type-mono"
					>
						{lineDiff(a, b).map((line, i) => (
							<div
								// A diff line has no id; its place in the diff is its identity.
								// biome-ignore lint/suspicious/noArrayIndexKey: lines repeat, so the index is the key
								key={i}
								data-kind={line.kind}
								className={cn("px-3 whitespace-pre-wrap", DIFF_TONE[line.kind])}
							>
								<span
									aria-hidden="true"
									className="mr-2 select-none text-text-subtle"
								>
									{DIFF_MARK[line.kind]}
								</span>
								{line.kind === "same" ? null : (
									<span className="sr-only">
										{line.kind === "add" ? "Added: " : "Removed: "}
									</span>
								)}
								{line.text}
							</div>
						))}
					</pre>
				</section>
			))}
		</div>
	);
}
