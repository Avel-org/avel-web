import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import type { ApiError } from "@/lib/api";
import {
	type MissionPlanBody,
	type StartPlan,
	startPlanBody,
} from "@/lib/api/mission-plans";
import { ActionModal, type IssuePath, ModalField } from "./action-modal";
import { useOpenGeneration } from "./use-open-generation";
import { type Change, WhatChanges } from "./what-changes";

/** A stored value as one short mono line, for the "Not carried over" list. */
export function storedPreview(value: unknown): string {
	const text = typeof value === "string" ? value : JSON.stringify(value);
	const line = (text ?? String(value)).replace(/\s+/g, " ");
	return line.length > 160 ? `${line.slice(0, 159)}…` : line;
}

/**
 * What starting the plan does, for the WhatChanges strip: the summary kept
 * (or the one being written), the three lists starting empty, and every
 * stored key the save replaces.
 */
export function startPlanChanges(
	start: StartPlan,
	raw: Record<string, unknown>,
	summary: string,
): Change[] {
	const changes: Change[] = [
		start.needsSummary
			? {
					label: "Summary",
					kind: "add",
					to: summary.trim() === "" ? "A summary is needed" : summary.trim(),
				}
			: {
					label: "Summary",
					kind: "add",
					to: `Kept: ${start.body.brief.summary}`,
				},
		{ label: "Requirements", kind: "add", to: "None yet" },
		{ label: "Criteria", kind: "add", to: "None yet" },
		{ label: "Modules", kind: "add", to: "None yet" },
	];
	for (const key of start.dropped) {
		changes.push({
			label: `Stored ${key}`,
			kind: "remove",
			from: storedPreview(raw[key]),
			mono: true,
		});
	}
	return changes;
}

/** The one field this modal has: the summary, when the stored one is unusable. */
const startFieldOf = (path: IssuePath): string | null =>
	path[0] === "brief" && path[1] === "summary" ? "summary" : null;

/**
 * Start a plan over a brief that predates the shape (Confirm). It shows in
 * full what the save replaces: the stored keys that are not carried over.
 * There is no inverse request, so it is a confirmation, but nothing hidden
 * is lost, so it is not styled destructive.
 */
export function StartPlanModal({
	open,
	onOpenChange,
	rawBrief,
	pending,
	error,
	onStart,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/** The mission's stored brief, as the mission detail serves it. */
	rawBrief: unknown;
	pending: boolean;
	error: ApiError | null;
	onStart: (body: MissionPlanBody) => void;
}) {
	const generation = useOpenGeneration(open);
	return (
		<StartPlanForm
			key={generation}
			open={open}
			onOpenChange={onOpenChange}
			rawBrief={rawBrief}
			pending={pending}
			error={error}
			onStart={onStart}
		/>
	);
}

export function StartPlanForm({
	open = true,
	onOpenChange = () => {},
	rawBrief,
	pending,
	error,
	onStart,
}: {
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	rawBrief: unknown;
	pending: boolean;
	error: ApiError | null;
	onStart: (body: MissionPlanBody) => void;
}) {
	const start = startPlanBody(rawBrief);
	const raw =
		rawBrief !== null &&
		typeof rawBrief === "object" &&
		!Array.isArray(rawBrief)
			? (rawBrief as Record<string, unknown>)
			: {};
	const [summary, setSummary] = useState("");
	const missing = start.needsSummary && summary.trim() === "";

	const submit = () => {
		if (missing) return;
		onStart(
			start.needsSummary
				? {
						...start.body,
						brief: { ...start.body.brief, summary: summary.trim() },
					}
				: start.body,
		);
	};

	return (
		<ActionModal
			open={open}
			onOpenChange={onOpenChange}
			size="confirm"
			title="Start a plan"
			description="The stored brief predates the brief's current shape. Starting a plan replaces it with one you can edit."
			dirty={summary !== ""}
			submitLabel="Start the plan"
			pendingLabel="Starting"
			onSubmit={submit}
			pending={pending}
			submitDisabledReason={
				missing ? "Write a summary first: every plan needs one." : undefined
			}
			error={error}
			fieldOf={startFieldOf}
			changes={
				<WhatChanges
					data-testid="plan-start-changes"
					changes={startPlanChanges(start, raw, summary)}
				/>
			}
			data-testid="plan-start-modal"
		>
			{start.needsSummary ? (
				<ModalField
					name="summary"
					label="Summary"
					hint="The stored brief has none the plan can use"
					testid="plan-start-summary"
				>
					{(props) => (
						<Textarea
							{...props}
							rows={3}
							maxLength={5_000}
							autoFocus
							value={summary}
							onChange={(e) => setSummary(e.target.value)}
						/>
					)}
				</ModalField>
			) : (
				<section data-testid="plan-start-kept" className="flex flex-col gap-1">
					<h3 className="type-small font-medium text-foreground">
						Summary, kept
					</h3>
					<p className="type-body whitespace-pre-wrap text-foreground">
						{start.body.brief.summary}
					</p>
				</section>
			)}
			{start.dropped.length > 0 ? (
				<section
					data-testid="plan-start-dropped"
					className="flex flex-col gap-1.5"
				>
					<h3 className="type-small font-medium text-foreground">
						Not carried over
					</h3>
					<dl className="flex flex-col gap-1">
						{start.dropped.map((key) => (
							<div
								key={key}
								data-testid={`plan-start-dropped-${key}`}
								className="flex flex-col gap-0.5 rounded-control border border-border px-2 py-1.5"
							>
								<dt className="type-mono text-text-subtle">{key}</dt>
								<dd className="type-mono break-words text-text-muted">
									{storedPreview(raw[key])}
								</dd>
							</div>
						))}
					</dl>
				</section>
			) : null}
		</ActionModal>
	);
}
