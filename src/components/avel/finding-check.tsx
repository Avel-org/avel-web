import type { Finding, PermanentCheck } from "avel-server/contract";
import { ShieldCheck } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ApiError } from "@/lib/api";
import { useSetFindingCheck } from "@/lib/api/gate";
import { describeError } from "@/lib/error-map";
import { ActionModal, type IssuePath, ModalField } from "./action-modal";
import { OptionCards } from "./option-cards";
import { Reason } from "./reason";

/*
 * A confirmed finding's permanent check (module 12, 2026-10-24): text that
 * must never appear again in the named paths. Every later mission in its
 * scope runs it on the files its work changed, and a match fails the gate.
 * The text is literal and case-sensitive, never a pattern: a written regex
 * could hang the gate. Only a confirmed finding carries one.
 */

/** The globs, one a line, as the check sends them: trimmed, blanks dropped. */
export function pathsFromLines(lines: string): string[] {
	return [
		...new Set(
			lines
				.split("\n")
				.map((l) => l.trim())
				.filter((l) => l !== ""),
		),
	];
}

const SCOPE_LABEL = {
	client: "This client's missions",
	general: "Every mission",
} as const satisfies Record<PermanentCheck["scope"], string>;

/** The finding's check, or the way to add one. Confirmed findings only. */
export function FindingCheckLine({
	finding,
	missionId,
}: {
	finding: Finding;
	missionId: string;
}) {
	const [editing, setEditing] = useState(false);
	const remove = useSetFindingCheck(missionId);
	const check = finding.check;
	return (
		<div
			data-testid={`finding-${finding.id}-check`}
			className="flex flex-col gap-1.5"
		>
			{check ? (
				<div className="flex flex-wrap items-start gap-2 rounded-control border border-border bg-app-hollow px-2.5 py-2">
					<ShieldCheck
						aria-hidden="true"
						className="mt-0.5 size-4 shrink-0 text-text-muted"
					/>
					<div className="flex min-w-0 flex-1 flex-col gap-0.5 type-small">
						<p className="text-text">
							{"Fails any later gate where "}
							<code
								data-testid={`finding-${finding.id}-check-text`}
								className="rounded-xs border border-border px-1 type-mono break-all"
							>
								{check.text}
							</code>
							{" appears"}
						</p>
						<p className="type-caption text-text-muted">
							<span className="type-mono break-all">
								{check.paths.join(", ")}
							</span>
							{`, on ${SCOPE_LABEL[check.scope].toLowerCase()}`}
						</p>
					</div>
					<span className="flex shrink-0 gap-1">
						<Button
							type="button"
							size="sm"
							variant="ghost"
							data-testid={`finding-${finding.id}-check-edit`}
							onClick={() => setEditing(true)}
						>
							Edit
						</Button>
						<Button
							type="button"
							size="sm"
							variant="ghost"
							data-testid={`finding-${finding.id}-check-remove`}
							disabledReason={remove.isPending ? "Removing" : undefined}
							onClick={() => remove.mutate({ id: finding.id, check: null })}
						>
							Remove
						</Button>
					</span>
				</div>
			) : (
				<Button
					type="button"
					size="sm"
					variant="outline"
					className="w-fit"
					data-testid={`finding-${finding.id}-check-add`}
					onClick={() => setEditing(true)}
				>
					<ShieldCheck aria-hidden="true" />
					Add a permanent check
				</Button>
			)}
			{remove.error ? (
				<Reason data-testid={`finding-${finding.id}-check-refused`}>
					{describeError(remove.error).what}
				</Reason>
			) : null}
			{editing ? (
				<FindingCheckModal
					finding={finding}
					missionId={missionId}
					onClose={() => setEditing(false)}
				/>
			) : null}
		</div>
	);
}

function FindingCheckModal({
	finding,
	missionId,
	onClose,
}: {
	finding: Finding;
	missionId: string;
	onClose: () => void;
}) {
	const set = useSetFindingCheck(missionId);
	return (
		<FindingCheckForm
			finding={finding}
			pending={set.isPending}
			error={set.error}
			onOpenChange={(open) => {
				if (!open) {
					set.reset();
					onClose();
				}
			}}
			onSubmit={(check) =>
				set.mutate({ id: finding.id, check }, { onSuccess: onClose })
			}
		/>
	);
}

const CHECK_FIELDS = ["paths", "text", "scope"] as const;
/** The body's issues sit under check.<field>. */
const checkFieldOf = (path: IssuePath): string | null =>
	path[0] === "check" && (CHECK_FIELDS as readonly unknown[]).includes(path[1])
		? (path[1] as string)
		: null;

export function FindingCheckForm({
	finding,
	pending,
	error,
	onOpenChange = () => {},
	onSubmit,
}: {
	finding: Finding;
	pending: boolean;
	error: ApiError | null;
	onOpenChange?: (open: boolean) => void;
	onSubmit: (check: PermanentCheck) => void;
}) {
	const start = finding.check;
	// An internal mission's finding has no client to scope to.
	const canScopeClient = finding.clientId !== null;
	const [paths, setPaths] = useState(start?.paths.join("\n") ?? "");
	const [text, setText] = useState(start?.text ?? "");
	const [scope, setScope] = useState<PermanentCheck["scope"]>(
		start?.scope ?? (canScopeClient ? "client" : "general"),
	);
	const list = pathsFromLines(paths);
	const check: PermanentCheck = {
		kind: "forbidden_text",
		paths: list,
		text,
		scope,
	};
	const dirty = JSON.stringify(start ?? null) !== JSON.stringify(check);
	const reason =
		list.length === 0
			? "Name at least one path"
			: list.length > 20
				? "At most 20 paths"
				: text === ""
					? "Give the text it must not find"
					: !dirty
						? "Nothing has changed"
						: undefined;
	return (
		<ActionModal
			open
			onOpenChange={onOpenChange}
			size="form"
			title={start ? "Edit permanent check" : "Add a permanent check"}
			description={finding.subject}
			dirty={dirty}
			submitLabel="Save check"
			pendingLabel="Saving"
			submitDisabledReason={reason}
			onSubmit={() => onSubmit(check)}
			pending={pending}
			error={error}
			fieldOf={checkFieldOf}
			data-testid="finding-check-form"
		>
			<ModalField
				name="text"
				label="Text it must not find"
				hint="Exact and case-sensitive, up to 200 characters"
				testid="finding-check-form-text"
			>
				{(props) => (
					<Input
						{...props}
						className="type-mono"
						maxLength={200}
						placeholder="dangerouslySetInnerHTML"
						value={text}
						onChange={(e) => setText(e.target.value)}
					/>
				)}
			</ModalField>
			<ModalField
				name="paths"
				label="Where"
				hint="Repository globs, one a line, up to 20"
				testid="finding-check-form-paths"
			>
				{(props) => (
					<Textarea
						{...props}
						rows={3}
						className="type-mono"
						placeholder="src/**/*.tsx"
						value={paths}
						onChange={(e) => setPaths(e.target.value)}
					/>
				)}
			</ModalField>
			<OptionCards
				legend="Runs on"
				value={scope}
				onChange={setScope}
				columns={2}
				data-testid="finding-check-form-scope"
				options={(["client", "general"] as const).map((value) => ({
					value,
					title: SCOPE_LABEL[value],
					"data-testid": `finding-check-form-scope-${value}`,
					...(value === "client" && !canScopeClient
						? {
								disabledReason:
									"This finding is on an internal mission, so it has no client",
							}
						: {}),
				}))}
			/>
			<p className="type-caption text-text-muted">
				Each later mission in scope runs it on the files its work changed. A
				match fails the gate there.
			</p>
		</ActionModal>
	);
}
