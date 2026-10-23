import { Link } from "@tanstack/react-router";
import { Skeleton } from "@/components/ui/skeleton";
import { useMissionExports } from "@/lib/api/exports";
import { shortStamp } from "./activity-audit";
import { RESULT } from "./gate-copy";
import { EXPORT_STATUS_LABEL } from "./lifecycle";
import { ROW_LINK_GROUP, RowChevron } from "./row-link";
import { exportStatusTone, StatusGlyph, StatusPill } from "./status-pill";
import { ErrorState, Surface } from "./surface";

/** The glyph's ink for each gate result: the glyph draws in currentColor. */
const RESULT_INK = {
	verified: "text-gate-pass",
	pass: "text-gate-warn",
	fail: "text-gate-block",
} as const;

const TARGET_WORD = {
	zip: "zip",
	github_pr: "GitHub PR",
	github_push: "GitHub push",
} as const;

/**
 * A mission's exports, previews included, newest first (contract
 * exports.list). Each row opens its status page; the gate glyph is the
 * result of the run it ships.
 */
export function MissionExportList({ missionId }: { missionId: string }) {
	const exports = useMissionExports(missionId);
	const rows = exports.data?.pages.flatMap((p) => p.data) ?? [];
	return (
		<Surface
			data-testid="mission-exports-list"
			query={exports}
			isEmpty={() => rows.length === 0}
			loading={
				<div className="flex flex-col gap-2">
					<Skeleton className="h-9 w-full rounded-control" />
					<Skeleton className="h-9 w-full rounded-control" />
				</div>
			}
			empty={
				<p className="py-2 type-small text-text-subtle">
					Nothing exported or previewed yet.
				</p>
			}
			error={ErrorState}
		>
			{() => (
				<ul className="flex flex-col">
					{rows.map((exp) => {
						const result = RESULT[exp.gateRun.result];
						return (
							<li key={exp.id}>
								<Link
									to="/missions/$id/exports/$exportId"
									params={{ id: missionId, exportId: exp.id }}
									data-testid={`mission-export-${exp.id}`}
									className={`${ROW_LINK_GROUP} flex min-w-0 items-center gap-2.5 rounded-control px-2 py-1.5 transition-colors duration-(--duration-micro) ease-avel hover:bg-app-raised`}
								>
									<StatusPill
										size="sm"
										tone={exportStatusTone(exp.status)}
										label={EXPORT_STATUS_LABEL[exp.status]}
									/>
									<span className="min-w-0 flex-1 truncate type-small text-text">
										{exp.dryRun
											? `Preview, ${TARGET_WORD[exp.targetKind]}`
											: TARGET_WORD[exp.targetKind]}
									</span>
									<span
										title={`Gate run: ${result.label}`}
										className="inline-flex"
									>
										<StatusGlyph
											tone={result.tone}
											className={RESULT_INK[exp.gateRun.result]}
										/>
										<span className="sr-only">{`Gate run ${result.label}`}</span>
									</span>
									<time
										dateTime={exp.createdAt}
										title={exp.createdAt}
										className="type-caption text-text-subtle"
									>
										{shortStamp(exp.createdAt)}
									</time>
									<RowChevron />
								</Link>
							</li>
						);
					})}
				</ul>
			)}
		</Surface>
	);
}
