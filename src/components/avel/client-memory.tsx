import type { ClientMemory } from "avel-server/contract";
import { Brain, Check, Pencil, Plus, Trash2 } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
	CANON_MESSAGE_MAX,
	useClientMemory,
	useEditClientMemory,
	useKeepClientMemory,
	useRemoveClientMemory,
	useWriteClientMemory,
} from "@/lib/api/canon";
import { describeError } from "@/lib/error-map";
import { shortStamp } from "./activity-audit";
import { ActorMark } from "./actor";
import { EmptyState } from "./empty-state";
import { Markdown } from "./markdown";
import { PanelFooter } from "./panel-footer";
import { Reason } from "./reason";
import { SectionPanel } from "./section-panel";
import { ErrorState, Surface } from "./surface";

/*
 * A client's project memory: what holds across this client's missions.
 * Canon proposes; only the operator keeps (or edits, or removes). What the
 * operator writes is kept at once. Removed memories stay listed under a
 * toggle, as a record, and can no longer be edited.
 */

export function ClientMemoryPanel({ clientId }: { clientId: string }) {
	const memory = useClientMemory(clientId);
	const rows = memory.data?.pages.flatMap((p) => p.data) ?? [];
	const [showRemoved, setShowRemoved] = useState(false);
	const [writing, setWriting] = useState(false);
	const proposed = rows.filter((m) => m.status === "proposed");
	const kept = rows.filter((m) => m.status === "kept");
	const removed = rows.filter((m) => m.status === "removed");
	return (
		<SectionPanel
			title="Memory"
			data-testid="client-memory"
			description="What holds across this client's missions. Canon proposes; you decide what is kept."
			actions={
				<Button
					type="button"
					variant="outline"
					size="sm"
					data-testid="client-memory-write-open"
					onClick={() => setWriting(true)}
				>
					<Plus aria-hidden="true" />
					Write a memory
				</Button>
			}
			footer={
				<PanelFooter data-testid="client-memory-read-age" queries={[memory]}>
					{removed.length > 0 ? (
						<Button
							type="button"
							variant="ghost"
							size="sm"
							aria-pressed={showRemoved}
							data-testid="client-memory-removed-toggle"
							onClick={() => setShowRemoved((v) => !v)}
						>
							{showRemoved
								? "Hide removed"
								: `Show removed (${removed.length})`}
						</Button>
					) : null}
				</PanelFooter>
			}
		>
			{writing ? (
				<WriteMemory clientId={clientId} onDone={() => setWriting(false)} />
			) : null}
			<Surface
				data-testid="client-memory-list"
				query={memory}
				isEmpty={() => rows.length === 0}
				loading={<Skeleton className="h-16 w-full rounded-card" />}
				empty={
					<EmptyState
						data-testid="client-memory-empty"
						compact
						icon={Brain}
						title="No memory yet"
						description="Canon proposes memories as it briefs, or write one yourself."
					/>
				}
				error={ErrorState}
			>
				{() => (
					<div className="flex flex-col gap-3">
						{proposed.length > 0 ? (
							<MemoryGroup
								label="Proposed by Canon"
								items={proposed}
								clientId={clientId}
								testId="client-memory-proposed"
							/>
						) : null}
						{kept.length > 0 ? (
							<MemoryGroup
								label="Kept"
								items={kept}
								clientId={clientId}
								testId="client-memory-kept"
							/>
						) : null}
						{showRemoved && removed.length > 0 ? (
							<MemoryGroup
								label="Removed"
								items={removed}
								clientId={clientId}
								testId="client-memory-removed"
							/>
						) : null}
					</div>
				)}
			</Surface>
		</SectionPanel>
	);
}

function MemoryGroup({
	label,
	items,
	clientId,
	testId,
}: {
	label: string;
	items: ClientMemory[];
	clientId: string;
	testId: string;
}) {
	return (
		<section
			aria-label={label}
			data-testid={testId}
			className="flex flex-col gap-1.5"
		>
			<h3 className="type-eyebrow">{label}</h3>
			<ul className="flex flex-col divide-y divide-border rounded-card border border-border">
				{items.map((m) => (
					<MemoryRow key={m.id} memory={m} clientId={clientId} />
				))}
			</ul>
		</section>
	);
}

/** One memory: its text, who proposed or wrote it, and what can be done. */
export function MemoryRow({
	memory: m,
	clientId,
}: {
	memory: ClientMemory;
	clientId: string;
}) {
	const keep = useKeepClientMemory(clientId);
	const remove = useRemoveClientMemory(clientId);
	const [editing, setEditing] = useState(false);
	const error = keep.error ?? remove.error;
	const byCanon = m.proposedBy?.kind === "canon";
	return (
		<li
			data-testid={`client-memory-${m.id}`}
			data-status={m.status}
			className="flex flex-col gap-1.5 px-3 py-2.5"
		>
			{editing ? (
				<EditMemory
					memory={m}
					clientId={clientId}
					onDone={() => setEditing(false)}
				/>
			) : (
				<Markdown
					text={m.contentMd}
					className={
						m.status === "removed" ? "text-text-muted line-through" : undefined
					}
				/>
			)}
			<div className="flex flex-wrap items-center gap-2">
				<span className="inline-flex items-center gap-1.5 type-caption text-text-subtle">
					<ActorMark kind={byCanon ? "canon" : "operator"} />
					{byCanon
						? "Proposed by Canon"
						: `Written by ${m.decidedBy?.display ?? "an operator"}`}
					<time dateTime={m.createdAt} title={m.createdAt}>
						{shortStamp(m.createdAt)}
					</time>
				</span>
				{m.status === "removed" || editing ? null : (
					<span className="ml-auto flex items-center gap-1">
						{m.status === "proposed" ? (
							<Button
								type="button"
								variant="secondary"
								size="sm"
								data-testid={`client-memory-${m.id}-keep`}
								onClick={() => keep.mutate(m.id)}
							>
								<Check aria-hidden="true" />
								Keep
							</Button>
						) : null}
						<Button
							type="button"
							variant="ghost"
							size="sm"
							data-testid={`client-memory-${m.id}-edit`}
							onClick={() => setEditing(true)}
						>
							<Pencil aria-hidden="true" />
							Edit
						</Button>
						<Button
							type="button"
							variant="ghost"
							size="sm"
							data-testid={`client-memory-${m.id}-remove`}
							onClick={() => remove.mutate(m.id)}
						>
							<Trash2 aria-hidden="true" />
							Remove
						</Button>
					</span>
				)}
			</div>
			{error ? <Reason>{describeError(error).what}</Reason> : null}
		</li>
	);
}

/** The text of a memory being written or edited, up to 20,000 characters. */
function MemoryField({
	value,
	onChange,
	label,
	testId,
}: {
	value: string;
	onChange: (value: string) => void;
	label: string;
	testId: string;
}) {
	const id = useId();
	return (
		<div className="flex flex-col gap-1">
			<label htmlFor={id} className="type-caption text-text-subtle">
				{label}
			</label>
			<Textarea
				id={id}
				rows={3}
				maxLength={CANON_MESSAGE_MAX}
				data-testid={testId}
				value={value}
				onChange={(e) => onChange(e.target.value)}
			/>
		</div>
	);
}

function WriteMemory({
	clientId,
	onDone,
}: {
	clientId: string;
	onDone: () => void;
}) {
	const write = useWriteClientMemory(clientId);
	const [text, setText] = useState("");
	return (
		<div data-testid="client-memory-write" className="flex flex-col gap-2">
			<MemoryField
				value={text}
				onChange={setText}
				label="What should hold for this client's missions"
				testId="client-memory-write-field"
			/>
			<span className="flex gap-1.5">
				<Button
					type="button"
					size="sm"
					data-testid="client-memory-write-save"
					disabledReason={
						text.trim() === "" ? "Write the memory first." : undefined
					}
					onClick={() => write.mutate(text.trim(), { onSuccess: onDone })}
				>
					Keep this memory
				</Button>
				<Button type="button" variant="ghost" size="sm" onClick={onDone}>
					Cancel
				</Button>
			</span>
			{/* No Try again: this write carries no idempotency key, so a resend
			    after a timeout the server committed would keep the memory twice.
			    Keep this memory sends it again, on purpose. */}
			{write.error ? <ErrorState error={write.error} /> : null}
		</div>
	);
}

function EditMemory({
	memory,
	clientId,
	onDone,
}: {
	memory: ClientMemory;
	clientId: string;
	onDone: () => void;
}) {
	const edit = useEditClientMemory(clientId);
	const [text, setText] = useState(memory.contentMd);
	const unchanged = text.trim() === memory.contentMd.trim();
	return (
		<div className="flex flex-col gap-2">
			<MemoryField
				value={text}
				onChange={setText}
				label="Memory"
				testId={`client-memory-${memory.id}-field`}
			/>
			<span className="flex gap-1.5">
				<Button
					type="button"
					size="sm"
					data-testid={`client-memory-${memory.id}-save`}
					disabledReason={
						text.trim() === ""
							? "A memory can't be empty. Remove it instead."
							: unchanged
								? "Nothing changed yet."
								: undefined
					}
					onClick={() =>
						edit.mutate(
							{ id: memory.id, contentMd: text.trim() },
							{ onSuccess: onDone },
						)
					}
				>
					Save
				</Button>
				<Button type="button" variant="ghost" size="sm" onClick={onDone}>
					Cancel
				</Button>
			</span>
			{edit.error ? <Reason>{describeError(edit.error).what}</Reason> : null}
		</div>
	);
}
