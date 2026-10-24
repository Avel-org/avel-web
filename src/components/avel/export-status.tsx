import { Link } from "@tanstack/react-router";
import type { ExportWire } from "avel-server/contract";
import { Download, ExternalLink, Eye, RefreshCw } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
	exportZipUrl,
	refreshable,
	useExport,
	useRefreshExport,
} from "@/lib/api/exports";
import { describeError } from "@/lib/error-map";
import { DeliveryChecks, PackageFacts, PackageMap } from "./export-package";
import { PreflightSkeleton } from "./export-preflight";
import { EXPORT_LIFECYCLE, Lifecycle } from "./lifecycle";
import { ExportSince } from "./mission-columns";
import { PanelFooter } from "./panel-footer";
import { SectionPanel } from "./section-panel";
import { ShortHash } from "./short-hash";
import {
	EXPORT_STATUS_LABEL,
	EXPORT_TARGET_LABEL,
	exportStatusTone,
	StatusPill,
} from "./status-pill";
import { ErrorState, Surface } from "./surface";

/*
 * One export (ROUTES.md, /missions/:id/exports/:exportId): a resumable view
 * keyed on the export's id, so it survives a closed tab, a reload and a
 * phone. A preview offers its way back into pre-flight; a done zip offers
 * its bytes, which the server renders again on each download. A pull request
 * links to GitHub, and is asked about there once as the page opens and on
 * Check on GitHub (merged is done, closed is closed); a delivering one reads
 * again until it settles. A failed export says what GitHub answered.
 */

export function ExportStatus({
	missionId,
	exportId,
}: {
	missionId: string;
	exportId: string;
}) {
	const query = useExport(exportId);
	return (
		<Surface
			data-testid="export-status"
			query={query}
			isEmpty={() => false}
			empty={null}
			loading={<PreflightSkeleton />}
			error={ErrorState}
		>
			{(exp) => (
				<div className="flex min-w-0 flex-col gap-4 lg:grid lg:grid-cols-12 lg:items-start">
					<div className="flex min-w-0 flex-col gap-4 lg:col-span-8">
						<SectionPanel
							title={exp.dryRun ? "Preview" : "Delivery"}
							data-testid="export-status-head"
							footer={
								<PanelFooter
									data-testid="export-status-read-age"
									queries={[query]}
								/>
							}
						>
							<Head exp={exp} missionId={missionId} />
						</SectionPanel>
						<SectionPanel title="Package" data-testid="export-status-package">
							<PackageMap exp={exp} />
						</SectionPanel>
					</div>
					<div className="flex min-w-0 flex-col gap-4 lg:col-span-4">
						{exp.dryRun ? (
							<SectionPanel
								title="Delivery check"
								data-testid="export-status-checks"
							>
								<DeliveryChecks exp={exp} />
							</SectionPanel>
						) : null}
						<SectionPanel
							title="Package facts"
							data-testid="export-status-facts"
						>
							<PackageFacts exp={exp} />
						</SectionPanel>
					</div>
				</div>
			)}
		</Surface>
	);
}

function Head({ exp, missionId }: { exp: ExportWire; missionId: string }) {
	const doneZip = exp.status === "done" && exp.targetKind === "zip" && exp.zip;
	return (
		<div className="flex flex-col gap-3">
			<p className="flex flex-wrap items-center gap-2 type-small text-text-muted">
				<StatusPill
					size="sm"
					tone={exportStatusTone(exp.status)}
					label={EXPORT_STATUS_LABEL[exp.status]}
					data-testid="export-status-pill"
				/>
				<span className="text-text">{EXPORT_TARGET_LABEL[exp.targetKind]}</span>
				<span>{`Sprint ${exp.sprintN}`}</span>
				<ExportSince at={exp.statusChangedAt} now={Date.now()} />
			</p>
			<Lifecycle
				spec={EXPORT_LIFECYCLE}
				current={exp.status}
				label="Export lifecycle"
				data-testid="export-status-lifecycle"
			/>
			{exp.dryRun ? (
				<div className="flex flex-wrap items-center gap-2">
					<p className="type-small text-text-muted">
						A preview delivers nothing. It records what delivering this gate run
						would do.
					</p>
					<Button asChild size="sm" variant="outline" className="ml-auto">
						<Link
							to="/missions/$id/exports/new"
							params={{ id: missionId }}
							search={{ preview: exp.id }}
							data-testid="export-status-preflight"
						>
							<Eye aria-hidden="true" />
							Open in pre-flight
						</Link>
					</Button>
				</div>
			) : null}
			{exp.pullRequest || refreshable(exp) ? <PullRequest exp={exp} /> : null}
			{exp.failure ? (
				<div
					role="alert"
					data-testid="export-status-failure"
					className="flex flex-col gap-1 rounded-control border border-destructive/40 px-3 py-2"
				>
					<p className="type-small text-text">{exp.failure.message}</p>
					<p className="type-caption text-text-muted">
						Preview again and deliver to try once more.
					</p>
				</div>
			) : null}
			{doneZip ? (
				<div className="flex flex-wrap items-center gap-2">
					<p className="type-small text-text-muted">
						Each download renders the package again and checks it against the
						zip's recorded hash.
					</p>
					<Button asChild size="sm" className="ml-auto">
						<a
							href={exportZipUrl(exp.id)}
							download
							data-testid="export-status-download"
						>
							<Download aria-hidden="true" />
							Download zip
						</a>
					</Button>
				</div>
			) : null}
		</div>
	);
}

const PR_STATE = {
	open: "Open on GitHub",
	merged: "Merged on GitHub",
	closed: "Closed on GitHub without merging",
} as const;

/**
 * A pull request's export: its link, branch and commit, and Check on GitHub.
 * It asks once as the page opens, then only when pressed: each ask spends
 * the connection's GitHub calls.
 */
function PullRequest({ exp }: { exp: ExportWire }) {
	const refresh = useRefreshExport();
	const can = refreshable(exp);
	const { mutate } = refresh;
	// Once per export as the page opens, while GitHub may have moved it.
	// biome-ignore lint/correctness/useExhaustiveDependencies: once per export, not per status change
	useEffect(() => {
		if (can) mutate(exp.id);
	}, [exp.id]);
	const pr = exp.pullRequest;
	return (
		<div data-testid="export-status-pr" className="flex flex-col gap-2">
			{pr ? (
				<div className="flex flex-wrap items-center gap-x-2 gap-y-1 type-small text-text-muted">
					<a
						href={pr.url}
						target="_blank"
						rel="noreferrer"
						data-testid="export-status-pr-link"
						className="inline-flex items-center gap-1 font-medium text-text underline decoration-border underline-offset-2 hover:decoration-current"
					>
						{`Pull request #${pr.number}`}
						<ExternalLink aria-hidden="true" className="size-3.5" />
					</a>
					<span data-testid="export-status-pr-state">{PR_STATE[pr.state]}</span>
					<span>on</span>
					<span className="type-mono text-text" title={pr.branch}>
						{pr.branch}
					</span>
					<ShortHash
						value={pr.commitSha}
						label="the commit AVEL made"
						data-testid="export-status-pr-commit"
					/>
				</div>
			) : (
				<p className="type-small text-text-muted">
					{exp.status === "delivering"
						? "AVEL is writing the branch and opening the pull request."
						: "No pull request is recorded for this export."}
				</p>
			)}
			{can ? (
				<div className="flex flex-wrap items-center gap-2">
					<p className="type-caption text-text-muted">
						AVEL learns a merge or close only when it asks GitHub.
					</p>
					<Button
						size="sm"
						variant="outline"
						className="ml-auto"
						data-testid="export-status-pr-refresh"
						disabledReason={refresh.isPending ? "Asking GitHub" : undefined}
						onClick={() => mutate(exp.id)}
					>
						<RefreshCw aria-hidden="true" />
						{refresh.isPending ? "Asking GitHub" : "Check on GitHub"}
					</Button>
				</div>
			) : null}
			{/* Only while it can still be asked: once the export settles, a
			    refusal from a check in flight no longer applies. */}
			{can && refresh.error ? (
				<p
					role="alert"
					data-testid="export-status-pr-refresh-error"
					className="type-small text-destructive"
				>
					{describeError(refresh.error).what}
				</p>
			) : null}
		</div>
	);
}
