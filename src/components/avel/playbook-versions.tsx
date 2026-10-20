import type { Playbook } from "avel-server/contract";
import { Skeleton } from "@/components/ui/skeleton";
import { usePlaybookVersions } from "@/lib/api/playbooks";
import { draftChanges, draftOf } from "./playbook-pipeline";
import { ErrorState, Surface } from "./surface";
import { WhatChanges } from "./what-changes";

/*
 * Every version of a playbook as it was written (playbooks.versions, read
 * from its activity), newest first, each with what it changed from the one
 * before. A playbook never rewritten has just its current version.
 */

export function PlaybookVersions({
	missionType,
	compact = false,
}: {
	missionType: string;
	/** The panel's list: version and date only. */
	compact?: boolean;
}) {
	const versions = usePlaybookVersions(missionType);
	return (
		<Surface
			data-testid={compact ? "playbook-panel-versions" : "playbook-versions"}
			query={versions}
			loading={<Skeleton className="h-16 w-full" />}
			// The current version is always there.
			empty={null}
			isEmpty={() => false}
			error={ErrorState}
		>
			{(rows) =>
				compact ? <VersionDates rows={rows} /> : <VersionHistory rows={rows} />
			}
		</Surface>
	);
}

/** When it was written: the date, with the full instant on hover. */
function Written({ at }: { at: string }) {
	return (
		<time dateTime={at} title={at} className="type-mono text-text-subtle">
			{at.slice(0, 10)}
		</time>
	);
}

function VersionDates({ rows }: { rows: Playbook[] }) {
	return (
		<ol className="flex flex-col gap-1">
			{rows.map((v, i) => (
				<li key={v.version} className="flex items-center justify-between gap-2">
					<span className="type-mono text-foreground">
						{`v${v.version}`}
						{i === 0 ? (
							<span className="ml-2 font-sans type-caption text-text-subtle">
								live
							</span>
						) : null}
					</span>
					<Written at={v.updatedAt} />
				</li>
			))}
		</ol>
	);
}

function VersionHistory({ rows }: { rows: Playbook[] }) {
	return (
		<ol className="flex flex-col gap-4">
			{rows.map((v, i) => {
				const before = rows[i + 1];
				return (
					<li
						key={v.version}
						data-testid={`playbook-version-${v.version}`}
						className="flex flex-col gap-2 p-4 rounded-card border border-border bg-app-panel shadow-card"
					>
						<p className="flex items-baseline gap-3">
							<span className="type-mono text-foreground">{`v${v.version}`}</span>
							{i === 0 ? (
								<span className="type-caption text-text-subtle">Live</span>
							) : null}
							<span className="ml-auto">
								<Written at={v.updatedAt} />
							</span>
						</p>
						{before ? (
							<WhatChanges
								changes={draftChanges(before, draftOf(v))}
								empty="No field changed."
								data-testid={`playbook-version-changes-${v.version}`}
							/>
						) : (
							<p className="type-small text-text-muted">The first version.</p>
						)}
					</li>
				);
			})}
		</ol>
	);
}
