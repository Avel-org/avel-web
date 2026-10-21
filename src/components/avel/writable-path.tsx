import { classifyGlob } from "avel-server/contract";
import { cn } from "@/lib/utils";

/*
 * One glob an agent may change, as the agent pages show it. A glob that
 * matches every file reads as "Any file", because a
 * bare `**` does not say what it allows to anyone who does not read globs.
 * The glob itself stays in the title. Whether a glob matches everything is
 * the contract's call (classifyGlob), so the page and the server agree.
 */

/** "Any file" for a glob that matches every file; otherwise the glob. */
export function writablePathText(glob: string): string {
	return matchesEveryFile(glob) ? "Any file" : glob;
}

function matchesEveryFile(glob: string): boolean {
	return classifyGlob(glob).kind === "all";
}

/** One glob: "Any file" in sans for a match-everything glob, else the glob. */
export function WritablePath({
	glob,
	className,
}: {
	glob: string;
	className?: string;
}) {
	const any = matchesEveryFile(glob);
	return (
		<span
			data-testid="writable-path"
			data-glob={glob}
			title={glob}
			// "Any file" is prose, so it leaves the mono of the list around it.
			className={cn(any && "font-sans", className)}
		>
			{any ? "Any file" : glob}
		</span>
	);
}
