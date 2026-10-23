import type { CanonCitation } from "avel-server/contract";
import { FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { HoverCard } from "./hover-card";

/*
 * A passage Canon rests on, as a chip: the file's name, and on hover the
 * heading path above the passage and the quote itself. A file whose bytes
 * are destroyed still names itself, marked "file purged": the passage can't
 * be opened again, and the chip never pretends it can.
 */

/** A citation, or a question's source (the same file and chunk, no quote). */
type Source = Pick<CanonCitation, "fileName" | "purged" | "chunkId"> &
	Partial<Pick<CanonCitation, "heading" | "quote">>;

/** "lines 12–30" from a chunk id's line range. */
export function chunkLines(chunkId: string): string {
	const range = chunkId.split(":")[1] ?? "";
	const [first, last] = range.split("-");
	return first === last ? `line ${first}` : `lines ${first}–${last}`;
}

export function CitationChip({
	source,
	"data-testid": testId,
}: {
	source: Source;
	"data-testid": string;
}) {
	const chip = (
		<span
			// biome-ignore lint/a11y/noNoninteractiveTabindex: the chip is a focus stop so a keyboard can open its preview, as hover does
			tabIndex={0}
			data-purged={source.purged || undefined}
			className={cn(
				"inline-flex h-6 max-w-[min(16rem,100%)] items-center gap-1 rounded-sm border px-1.5 type-caption",
				source.purged
					? "border-dashed border-border-strong bg-app-hollow text-text-muted"
					: "border-border bg-app-raised text-text",
			)}
		>
			<FileText
				aria-hidden="true"
				className="size-3 shrink-0 text-text-subtle"
			/>
			<span className="truncate">{source.fileName}</span>
			{source.purged ? (
				<span className="shrink-0 text-text-subtle">file purged</span>
			) : null}
		</span>
	);
	return (
		<HoverCard data-testid={testId} trigger={chip}>
			<div className="flex max-w-80 flex-col gap-1.5">
				<p className="type-caption text-text-subtle">
					{[source.fileName, ...(source.heading ?? [])].join(" / ")}
				</p>
				{source.quote ? (
					<blockquote className="border-l-2 border-border-strong pl-2 type-small text-text">
						{source.quote}
					</blockquote>
				) : null}
				<p className="type-caption text-text-muted">
					{source.purged
						? "Its bytes are destroyed: the passage can't be opened."
						: chunkLines(source.chunkId)}
				</p>
			</div>
		</HoverCard>
	);
}
