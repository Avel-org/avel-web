import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * A region with nothing to show, centred in the space it is given. Read top
 * to bottom it answers three questions, in this order of weight:
 *
 *   what lives here     the icon and the title
 *   what it is for      one or two plain sentences, written for the operator
 *   why it is empty     the eyebrow, a status pill such as "Not built", and the
 *                       contract routes it waits on, set apart below a hairline
 *
 * Status stays out of the sentences, so the copy reads the same before and
 * after the region is built. It is v3's empty band (UX 8): a dashed edge on
 * the band surface, because a dashed border marks a placeholder (AVEL-DESIGN.md
 * section 8) and a solid one bounds only something real. The eyebrow is a
 * pill with the same dashed edge. It fills its parent (flex-1), so a page body
 * that fills the height centres it on the canvas.
 */
export function EmptyState({
	icon: Icon,
	eyebrow,
	title,
	description,
	needs = [],
	action,
	compact = false,
	"data-testid": testId = "empty-state",
}: {
	icon: LucideIcon;
	eyebrow?: string;
	title: string;
	description: string;
	/** Contract routes this waits on, as named in the docs. */
	needs?: readonly string[];
	action?: ReactNode;
	/** For a popover or panel: less padding, same anatomy. */
	compact?: boolean;
	"data-testid"?: string;
}) {
	return (
		<div
			data-testid={testId}
			className={cn(
				"flex flex-1 flex-col items-center justify-center gap-1.5 rounded-card border border-dashed border-border-strong bg-app-band text-center",
				compact ? "px-4 py-7" : "px-6 py-16",
			)}
		>
			<div
				data-testid="empty-state-icon"
				className="mb-1 flex size-tile-md items-center justify-center rounded-tile border border-border bg-app-panel"
			>
				<Icon aria-hidden="true" className="size-4 text-text-subtle" />
			</div>
			{eyebrow ? (
				<p
					data-testid="empty-state-eyebrow"
					className="inline-flex h-[22px] items-center rounded-sm border border-dashed border-border-strong px-2 type-caption font-medium text-text-muted"
				>
					{eyebrow}
				</p>
			) : null}
			<h2
				data-testid="empty-state-title"
				className="max-w-md type-title text-balance text-text"
			>
				{title}
			</h2>
			<p
				data-testid="empty-state-description"
				className="max-w-[38ch] type-caption text-pretty text-text-muted"
			>
				{description}
			</p>
			{needs.length > 0 ? (
				<div
					data-testid="empty-state-needs"
					className="mt-2.5 flex w-full max-w-xs flex-wrap items-center justify-center gap-2 border-t border-border pt-4"
				>
					<span className="type-caption text-text-subtle">Waiting on</span>
					{needs.map((route) => (
						<Badge key={route} variant="tag" data-testid={`${testId}-need`}>
							{route}
						</Badge>
					))}
				</div>
			) : null}
			{action ? (
				<div data-testid="empty-state-action" className="mt-2">
					{action}
				</div>
			) : null}
		</div>
	);
}
