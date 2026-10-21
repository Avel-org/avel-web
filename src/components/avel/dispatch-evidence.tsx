import type { CompletionReport, Dispatch } from "avel-server/contract";
import { cn } from "@/lib/utils";
import { ActorMark, FILED_BY_ACTOR, HaltActor } from "./actor";
import { FILED_BY_LABEL, REPORT_STATUS_TONE } from "./completion-report";
import { DISPATCH_STATUS_LABEL } from "./dispatch-labels";
import { StatusGlyph, StatusPill } from "./status-pill";
import { VersionChip } from "./version-chip";

/*
 * What a closed dispatch proved, at the head of its card (audit F5): how it
 * ended, who closed it (the runner's mark and the limit for a halt at a
 * ceiling, otherwise who filed the report), how many files it touched, how
 * many paths it read at a hash their producer did not write, and the
 * identity version it ran as, solid if recorded and dashed if rebuilt.
 * Every value is the report's own; nothing is inferred. The report holds a
 * count of files touched but not the mount it was held to, so the count
 * stands alone, never judged against a mount it cannot see.
 */

const n = (v: number) => v.toLocaleString("en-US");

export function DispatchEvidence({
	dispatch,
	report,
}: {
	dispatch: Pick<Dispatch, "id" | "agent">;
	report: CompletionReport;
}) {
	const id = dispatch.id;
	const mismatches = report.edgeMismatches.length;
	return (
		<div
			data-testid={`dispatch-evidence-${id}`}
			className="flex flex-col gap-1 rounded-card border border-border bg-app-well px-2.5 py-1.5"
		>
			<div className="flex flex-wrap items-center gap-x-2 gap-y-1">
				<StatusPill
					size="sm"
					tone={REPORT_STATUS_TONE[report.status]}
					label={DISPATCH_STATUS_LABEL[report.status]}
					data-testid={`dispatch-evidence-status-${id}`}
				/>
				{report.status === "halted" && report.haltReason ? (
					<HaltActor
						reason={report.haltReason}
						data-testid={`dispatch-evidence-actor-${id}`}
					/>
				) : (
					<span
						data-testid={`dispatch-evidence-actor-${id}`}
						data-actor-kind={FILED_BY_ACTOR[report.filedBy]}
						className="inline-flex items-center gap-1.5 type-small text-text-muted"
					>
						<ActorMark
							kind={FILED_BY_ACTOR[report.filedBy]}
							name={dispatch.agent.name}
						/>
						{FILED_BY_LABEL[report.filedBy]}
					</span>
				)}
			</div>
			<div className="flex flex-wrap items-center gap-x-3 gap-y-1 type-small text-text-muted">
				<span data-testid={`dispatch-evidence-files-${id}`}>
					<span className="type-mono text-foreground tabular-nums">
						{n(report.filesTouched)}
					</span>
					{report.filesTouched === 1 ? " file touched" : " files touched"}
				</span>
				<span
					data-testid={`dispatch-evidence-mismatches-${id}`}
					data-count={mismatches}
					className={cn(
						"inline-flex items-center gap-1",
						mismatches > 0 ? "text-gate-warn" : "text-text-muted",
					)}
				>
					{mismatches > 0 ? <StatusGlyph tone="warn" /> : null}
					<span className="type-mono tabular-nums">{n(mismatches)}</span>
					{mismatches === 1 ? " edge mismatch" : " edge mismatches"}
				</span>
				<VersionChip
					versionRef={report.agentVersionRef}
					sha256={report.agentVersionSha256}
					source={report.versionSource}
					data-testid={`dispatch-evidence-version-${id}`}
				/>
			</div>
		</div>
	);
}
