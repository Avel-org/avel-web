import { Link } from "@tanstack/react-router";
import type { ExportWire, GateRunSummary } from "avel-server/contract";
import { Eye, PackageCheck } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
	type CreateExportBody,
	type ExportAttempt,
	exportAttemptFor,
	type PreviewExportBody,
	useCreateExport,
	useExport,
	usePreviewExport,
	writtenExportId,
} from "@/lib/api/exports";
import { useGateRuns } from "@/lib/api/gate";
import { DeliveryChecks, PackageFacts, PackageMap } from "./export-package";
import {
	choiceChanged,
	choiceOf,
	choiceProblem,
	deliverBodyOf,
	previewBodyOf,
	type TargetChoice,
	TargetPicker,
} from "./export-target";
import { RESULT } from "./gate-copy";
import { GateRefusal } from "./gate-panel";
import { useMission } from "./mission-data";
import { PanelFooter } from "./panel-footer";
import { retryOf } from "./retry";
import { SectionPanel } from "./section-panel";
import { ShortHash } from "./short-hash";
import { StatusPill } from "./status-pill";
import { ErrorState, Surface } from "./surface";

/*
 * The pre-flight screen (ROUTES.md, /missions/:id/exports/new). One flow,
 * top to bottom: the gate run that would ship, a preview of what delivering
 * it does, then Deliver. The preview is a dry-run export the server keeps,
 * named in the URL, so a reload or another tab lands on the same one.
 * Deliver is disabled by the preview's own `blocked`, never by styling,
 * and holds to confirm. A zip or a GitHub pull request delivers; a push
 * straight to GitHub is not built. Delivery sends what the preview recorded,
 * so a target changed since it is previewed again first.
 */

export function ExportPreflight({
	missionId,
	previewId,
	onPreviewed,
	onDelivered,
}: {
	missionId: string;
	/** The preview in the URL, if one was made. */
	previewId: string | null;
	onPreviewed: (id: string) => void;
	onDelivered: (id: string) => void;
}) {
	const runs = useGateRuns(missionId);
	const latest = runs.data?.pages[0]?.data[0] ?? null;
	const preview = useExport(previewId);
	const shown = preview.status === "success" ? preview.data : null;
	// The gate ran after this preview: delivering it would be refused.
	const outdated =
		shown !== null && latest !== null && shown.gateRun.id !== latest.id;
	// Undefined while the mission reads; null for an internal mission.
	const mission = useMission(missionId).data;
	const engagementId = mission ? (mission.engagement?.id ?? null) : undefined;
	// The target starts from the preview's, and again whenever another loads.
	const [choice, setChoice] = useState<TargetChoice>(() => choiceOf(shown));
	const [seen, setSeen] = useState(shown?.id ?? null);
	if ((shown?.id ?? null) !== seen) {
		setSeen(shown?.id ?? null);
		setChoice(choiceOf(shown));
	}
	const changed = choiceChanged(choice, shown);

	return (
		<div
			data-testid="export-preflight"
			className="flex min-w-0 flex-col gap-4 lg:grid lg:grid-cols-12 lg:items-start"
		>
			<div className="flex min-w-0 flex-col gap-4 lg:col-span-8">
				<SectionPanel
					title="What ships"
					data-testid="export-ships"
					footer={
						<PanelFooter data-testid="export-ships-read-age" queries={[runs]} />
					}
				>
					<Ships
						missionId={missionId}
						latest={latest}
						loading={runs.status === "pending"}
						shown={shown}
						outdated={outdated}
						changed={changed}
						choice={choice}
						onChoice={setChoice}
						engagementId={engagementId}
						onPreviewed={onPreviewed}
					/>
				</SectionPanel>
				<SectionPanel
					title="Package"
					description="The files the work wrote and deleted against the mission's base."
					data-testid="export-package-panel"
					footer={
						previewId ? (
							<PanelFooter
								data-testid="export-package-read-age"
								queries={[preview]}
							/>
						) : undefined
					}
				>
					{previewId ? (
						<PreviewSurface
							query={preview}
							data-testid="export-package-surface"
						>
							{(exp) => <PackageMap exp={exp} />}
						</PreviewSurface>
					) : (
						<p className="type-small text-text-subtle">
							Preview the export to see its files.
						</p>
					)}
				</SectionPanel>
			</div>
			<div className="flex min-w-0 flex-col gap-4 lg:col-span-4">
				<SectionPanel title="Delivery check" data-testid="export-check-panel">
					{previewId ? (
						<PreviewSurface query={preview} data-testid="export-check-surface">
							{(exp) => (
								<div className="flex flex-col gap-3">
									<DeliveryChecks exp={exp} />
									<Deliver
										missionId={missionId}
										preview={exp}
										outdated={outdated}
										changed={changed}
										onDelivered={onDelivered}
									/>
								</div>
							)}
						</PreviewSurface>
					) : (
						<p className="type-small text-text-subtle">
							A preview runs every check delivery would, and says which one
							would stop it.
						</p>
					)}
				</SectionPanel>
				{shown ? (
					<SectionPanel title="Package facts" data-testid="export-facts-panel">
						<PackageFacts exp={shown} />
					</SectionPanel>
				) : null}
			</div>
		</div>
	);
}

/** The latest gate run, the target, and Preview. */
function Ships({
	missionId,
	latest,
	loading,
	shown,
	outdated,
	changed,
	choice,
	onChoice,
	engagementId,
	onPreviewed,
}: {
	missionId: string;
	latest: GateRunSummary | null;
	loading: boolean;
	shown: ExportWire | null;
	outdated: boolean;
	/** The target chosen differs from the preview's. */
	changed: boolean;
	choice: TargetChoice;
	onChoice: (choice: TargetChoice) => void;
	/** The mission's engagement, whose connections a GitHub target uses. */
	engagementId: string | null | undefined;
	onPreviewed: (id: string) => void;
}) {
	const previewExport = usePreviewExport();
	const [last, setLast] = useState<ExportAttempt<PreviewExportBody> | null>(
		null,
	);
	const sent = {
		onSuccess: (written: ExportWire) => {
			setLast(null);
			onPreviewed(written.id);
		},
	};
	const body: PreviewExportBody = previewBodyOf(missionId, choice);
	const problem = choiceProblem(choice);
	const run = () => {
		const attempt = exportAttemptFor(last, body);
		setLast(attempt);
		previewExport.mutate(attempt, sent);
	};

	if (loading) return <PreflightSkeleton />;
	const result = latest ? RESULT[latest.result] : null;
	return (
		<div className="flex flex-col gap-3">
			{latest && result ? (
				<p
					data-testid="export-ships-run"
					className="flex flex-wrap items-center gap-x-1.5 gap-y-1 type-small text-text-muted"
				>
					<StatusPill size="sm" tone={result.tone} label={result.label} />
					<span>The gate's latest run judged</span>
					<ShortHash
						value={latest.commitSha}
						label="the judged commit"
						data-testid="export-ships-commit"
					/>
					<span>on base</span>
					<ShortHash
						value={latest.baseSha}
						label="the base commit"
						data-testid="export-ships-base"
					/>
				</p>
			) : (
				<p className="type-small text-text-muted">
					The gate hasn't judged this mission yet, so there is nothing to
					export.
				</p>
			)}
			<div className="flex flex-wrap items-start gap-2">
				<div className="min-w-0 flex-1">
					<TargetPicker
						choice={choice}
						onChange={onChoice}
						engagementId={engagementId}
					/>
				</div>
				<Button
					type="button"
					size="sm"
					variant={shown && !outdated && !changed ? "outline" : "default"}
					className="ml-auto"
					data-testid="export-preview"
					disabledReason={
						latest === null
							? "Run the gate first"
							: (problem ??
								(previewExport.isPending ? "Rendering the package" : undefined))
					}
					onClick={run}
				>
					<Eye aria-hidden="true" />
					{shown ? "Preview again" : "Preview"}
				</Button>
			</div>
			{changed && !outdated ? (
				<p
					data-testid="export-preview-changed"
					className="rounded-control border border-gate-warn-line bg-gate-warn-banner px-3 py-2 type-small text-text"
				>
					The target changed since this preview. Preview again to deliver there.
				</p>
			) : null}
			{outdated ? (
				<p
					data-testid="export-preview-outdated"
					className="rounded-control border border-gate-warn-line bg-gate-warn-banner px-3 py-2 type-small text-text"
				>
					The gate ran again after this preview. Preview again to ship the
					latest run.
				</p>
			) : null}
			{previewExport.error ? (
				<GateRefusal
					error={previewExport.error}
					missionId={missionId}
					{...retryOf(previewExport, sent)}
				/>
			) : null}
		</div>
	);
}

/**
 * Deliver the preview, to its own target: held to confirm, refused by state.
 * A pull request is written on GitHub inside the request, for a few seconds.
 * A GitHub 502 leaves an export, failed or still delivering, linked here.
 */
function Deliver({
	missionId,
	preview,
	outdated,
	changed,
	onDelivered,
}: {
	missionId: string;
	preview: ExportWire;
	outdated: boolean;
	/** The target chosen differs from the preview's. */
	changed: boolean;
	onDelivered: (id: string) => void;
}) {
	const create = useCreateExport();
	const [last, setLast] = useState<ExportAttempt<CreateExportBody> | null>(
		null,
	);
	const sent = {
		onSuccess: (written: ExportWire) => {
			setLast(null);
			onDelivered(written.id);
		},
	};
	const body: CreateExportBody = deliverBodyOf(preview);
	const pr = preview.targetKind === "github_pr";
	const writtenId = writtenExportId(create.error);
	const deliver = () => {
		const attempt = exportAttemptFor(last, body);
		setLast(attempt);
		create.mutate(attempt, sent);
	};
	const reason = outdated
		? "The gate ran again after this preview"
		: changed
			? "The target changed since this preview"
			: preview.blocked
				? "A delivery check blocks it"
				: create.isPending
					? "Delivering"
					: undefined;
	return (
		<div className="flex flex-col gap-2">
			<Button
				size="sm"
				holdToConfirm
				onConfirm={deliver}
				disabledReason={reason}
				data-testid="export-deliver"
			>
				<PackageCheck aria-hidden="true" />
				{create.isPending
					? pr
						? "Opening the pull request"
						: "Delivering"
					: pr
						? "Hold to open pull request"
						: "Hold to deliver zip"}
			</Button>
			<Note>
				{pr
					? "Renders the package again, checks it against this preview and the branch's tip, then writes a new branch and opens a pull request on GitHub. It takes a few seconds."
					: "Renders the package again and checks it against this preview before it hands you the zip."}
			</Note>
			{create.error ? (
				<GateRefusal
					error={create.error}
					missionId={missionId}
					// A GitHub 502 left an export: resending the same attempt only
					// replays it, so the way on is that export's page.
					{...(writtenId ? {} : retryOf(create, sent))}
				/>
			) : null}
			{writtenId ? (
				<Link
					to="/missions/$id/exports/$exportId"
					params={{ id: missionId, exportId: writtenId }}
					data-testid="export-deliver-failed"
					className="type-small text-text underline decoration-border underline-offset-2 hover:decoration-current"
				>
					Open the export to see where it stands
				</Link>
			) : null}
		</div>
	);
}

function Note({ children }: { children: ReactNode }) {
	return <p className="type-caption text-text-muted">{children}</p>;
}

/**
 * The preview named in the URL, through the four states every data region
 * has (section 8): its skeleton while it reads, the error map's copy with
 * Try again when it fails. One export is never empty: a missing one is 404.
 */
function PreviewSurface({
	query,
	children,
	"data-testid": testId,
}: {
	query: ReturnType<typeof useExport>;
	children: (exp: ExportWire) => ReactNode;
	"data-testid": string;
}) {
	return (
		<Surface
			data-testid={testId}
			query={query}
			isEmpty={() => false}
			empty={null}
			loading={<PreflightSkeleton />}
			error={ErrorState}
		>
			{children}
		</Surface>
	);
}

export function PreflightSkeleton() {
	return (
		<div data-testid="export-skeleton" className="flex flex-col gap-2">
			{[0, 1, 2].map((i) => (
				<Skeleton key={i} className="h-10 w-full rounded-control" />
			))}
		</div>
	);
}
