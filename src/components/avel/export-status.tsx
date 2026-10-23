import { Link } from "@tanstack/react-router";
import type { ExportWire } from "avel-server/contract";
import { Download, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { exportZipUrl, useExport } from "@/lib/api/exports";
import { DeliveryChecks, PackageFacts, PackageMap } from "./export-package";
import { PreflightSkeleton } from "./export-preflight";
import { EXPORT_LIFECYCLE, Lifecycle } from "./lifecycle";
import { ExportSince } from "./mission-columns";
import { PanelFooter } from "./panel-footer";
import { SectionPanel } from "./section-panel";
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
 * phone. Every export in this slice is final when its route answers, so the
 * page reads it once. A preview offers its way back into pre-flight; a done
 * zip offers its bytes, which the server renders again on each download.
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
