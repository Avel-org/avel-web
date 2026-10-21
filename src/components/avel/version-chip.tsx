import type { VersionSource } from "avel-server/contract";
import { cn } from "@/lib/utils";
import { VERSION_SOURCE_LABEL } from "./dispatch-labels";
import { IdentityVersionTrigger, lookupRef } from "./identity-version-sheet";

/*
 * An identity version, such as kel@v2, as a chip (audit D2). A version
 * hashed at the run is recorded: a solid edge, the evidence of a
 * mechanism. One rebuilt from git history afterwards is reconstructed: a
 * dashed edge, and the words "Rebuilt from history" beside it, so a rebuilt
 * version never looks like a recorded one. Neither takes a colour: the edge
 * and the words carry it. The chip opens the version it names.
 */
export function VersionChip({
	versionRef,
	sha256,
	source,
	"data-testid": testId,
}: {
	/** The display id; null when the server has none, and then only the
	    source is shown. */
	versionRef: string | null;
	/** The version's recorded hash: it resolves even for a deleted agent. */
	sha256?: string | null;
	source: VersionSource;
	"data-testid"?: string;
}) {
	const lookup = lookupRef(versionRef, sha256);
	return (
		<span
			data-testid={testId}
			data-source={source}
			className="inline-flex items-center gap-1.5"
		>
			{versionRef && lookup ? (
				<IdentityVersionTrigger
					lookup={lookup}
					label={versionRef}
					data-testid={testId ? `${testId}-ref` : undefined}
					className={cn(
						"inline-flex h-5 items-center rounded-xs border px-1.5 type-mono text-text-muted no-underline hover:bg-app-raised hover:text-text",
						source === "recorded"
							? "border-border-strong"
							: "border-dashed border-border-strong",
					)}
				>
					{versionRef}
				</IdentityVersionTrigger>
			) : null}
			{source === "reconstructed" ? (
				<span
					data-testid={testId ? `${testId}-source` : undefined}
					className="type-caption text-text-muted"
				>
					{VERSION_SOURCE_LABEL.reconstructed}
				</span>
			) : (
				<span className="sr-only">{`, ${VERSION_SOURCE_LABEL.recorded}`}</span>
			)}
		</span>
	);
}
