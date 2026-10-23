import type { BriefSource, Intake, IntakeFile } from "avel-server/contract";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useIntakeFiles } from "@/lib/api/intake-files";
import { type ReviewSourcesBody, useReviewSources } from "@/lib/api/intakes";
import { shortStamp } from "./activity-audit";
import { CitationChip } from "./canon-citation";
import { SectionPanel } from "./section-panel";
import { StatusGlyph } from "./status-pill";
import { ErrorState } from "./surface";

/*
 * The brief's sources, reviewed (POST /api/intakes/:id/sources, J
 * 2026-10-21). Canon cites the passages each requirement and criterion
 * stands on; the operator confirms that each passage supports its item, or
 * rejects it, which removes it. Approval waits until every source is
 * confirmed (brief_sources_unconfirmed), so the panel says how many remain
 * and offers them all at once. Only a draft or proposed intake takes
 * decisions; after that the panel is a record.
 */

type List = ReviewSourcesBody["decisions"][number]["list"];

export type CitedItem = {
	list: List;
	id: string;
	text: string;
	sources: BriefSource[];
};

/** Every requirement and criterion that cites a passage, in brief order. */
export function citedItems(brief: Intake["proposedBrief"]): CitedItem[] {
	if (!brief) return [];
	return [
		...brief.requirements.map((r) => ({
			list: "requirements" as const,
			id: r.id,
			text: r.text,
			sources: r.sources ?? [],
		})),
		...brief.acceptanceCriteria.map((c) => ({
			list: "acceptanceCriteria" as const,
			id: c.id,
			text: c.text,
			sources: c.sources ?? [],
		})),
	].filter((item) => item.sources.length > 0);
}

/** "3 of 5 confirmed", counting every source on the brief. */
export function confirmedCount(items: readonly CitedItem[]): {
	confirmed: number;
	total: number;
} {
	const all = items.flatMap((item) => item.sources);
	return {
		confirmed: all.filter((s) => s.confirmed !== null).length,
		total: all.length,
	};
}

/** Every source still waiting, as confirm decisions. */
export function confirmAllDecisions(
	items: readonly CitedItem[],
): ReviewSourcesBody["decisions"] {
	return items.flatMap((item) =>
		item.sources
			.filter((s) => s.confirmed === null)
			.map((s) => ({
				list: item.list,
				itemId: item.id,
				chunkId: s.chunkId,
				decision: "confirm" as const,
			})),
	);
}

/** A chunk id starts with its file's sha256: the file it is a passage of. */
export function fileOfChunk(
	chunkId: string,
	files: readonly IntakeFile[],
): IntakeFile | undefined {
	const sha = chunkId.split(":")[0];
	return files.find((file) => file.sha256 === sha);
}

/** Decisions are taken while the intake is still being written or reviewed. */
const reviewable = (intake: Intake) =>
	intake.status === "draft" || intake.status === "proposed";

export function IntakeSources({ intake }: { intake: Intake }) {
	const items = citedItems(intake.proposedBrief);
	const review = useReviewSources(intake.id);
	// Purged files too: a cited passage of one still names its file.
	const files = useIntakeFiles(intake.id, true);
	const loadedFiles = files.data?.pages.flatMap((page) => page.data) ?? [];
	if (items.length === 0) return null;
	const { confirmed, total } = confirmedCount(items);
	const open = reviewable(intake);
	const waiting = total - confirmed;
	const send = (decisions: ReviewSourcesBody["decisions"]) =>
		review.mutate({ decisions });
	return (
		<SectionPanel
			title="Sources"
			description={
				waiting > 0 && open
					? "Confirm that each passage supports its item, or reject it. Approval waits until every source is confirmed."
					: "The passages each item stands on."
			}
			data-testid="intake-sources"
			actions={
				open && waiting > 1 ? (
					<Button
						size="sm"
						variant="outline"
						data-testid="intake-sources-confirm-all"
						disabledReason={review.isPending ? "Saving" : undefined}
						onClick={() => send(confirmAllDecisions(items))}
					>
						<Check aria-hidden="true" />
						{`Confirm all ${waiting}`}
					</Button>
				) : null
			}
		>
			<div className="flex flex-col gap-3">
				<p
					data-testid="intake-sources-count"
					className="flex items-center gap-2 type-small text-text-muted"
				>
					<StatusGlyph
						tone={waiting === 0 ? "pass" : "warn"}
						className={waiting === 0 ? "text-gate-pass" : "text-gate-warn"}
					/>
					{`${confirmed} of ${total} confirmed`}
				</p>
				{review.error ? (
					<ErrorState
						error={review.error}
						retry={() => review.reset()}
						retrying={false}
					/>
				) : null}
				<ul className="flex flex-col divide-y divide-border">
					{items.map((item) => (
						<li
							key={`${item.list}-${item.id}`}
							data-testid={`intake-sources-item-${item.id}`}
							className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0"
						>
							<p className="flex min-w-0 items-baseline gap-2 type-small">
								<span className="shrink-0 type-mono text-text-subtle">
									{item.id}
								</span>
								<span title={item.text} className="line-clamp-2 text-text">
									{item.text}
								</span>
							</p>
							<ul className="flex flex-col gap-1.5 pl-1">
								{item.sources.map((source) => {
									const file = fileOfChunk(source.chunkId, loadedFiles);
									const decide = (decision: "confirm" | "reject") =>
										send([
											{
												list: item.list,
												itemId: item.id,
												chunkId: source.chunkId,
												decision,
											},
										]);
									return (
										<li
											key={source.chunkId}
											data-testid={`intake-source-${item.id}-${source.chunkId}`}
											data-confirmed={source.confirmed !== null}
											className="flex flex-wrap items-center gap-2"
										>
											<CitationChip
												source={{
													chunkId: source.chunkId,
													fileName: file?.name ?? "A file of this intake",
													purged: file ? file.purgedAt !== null : false,
												}}
												data-testid={`intake-source-chip-${source.chunkId}`}
											/>
											{source.confirmed ? (
												<span
													title={`Confirmed ${shortStamp(source.confirmed.at)}`}
													className="flex items-center gap-1 type-caption text-gate-pass"
												>
													<StatusGlyph tone="pass" />
													Confirmed
												</span>
											) : open ? (
												<span className="ml-auto flex items-center gap-1">
													<Button
														size="sm"
														variant="outline"
														data-testid={`intake-source-confirm-${item.id}-${source.chunkId}`}
														disabledReason={
															review.isPending ? "Saving" : undefined
														}
														onClick={() => decide("confirm")}
													>
														<Check aria-hidden="true" />
														Confirm
													</Button>
													<Button
														size="sm"
														variant="ghost"
														data-testid={`intake-source-reject-${item.id}-${source.chunkId}`}
														disabledReason={
															review.isPending ? "Saving" : undefined
														}
														aria-label={`Reject this passage for ${item.id}`}
														onClick={() => decide("reject")}
													>
														<X aria-hidden="true" />
														Reject
													</Button>
												</span>
											) : (
												<span className="type-caption text-text-subtle">
													Not confirmed
												</span>
											)}
										</li>
									);
								})}
							</ul>
						</li>
					))}
				</ul>
			</div>
		</SectionPanel>
	);
}
