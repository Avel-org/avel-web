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
 * after the region is built. The eyebrow's dashed border marks a placeholder,
 * as every dashed border does (AVEL-DESIGN.md section 8). It fills its parent
 * (flex-1), so a page body that fills the height centres it on the canvas.
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
				"flex flex-1 animate-page-in flex-col items-center justify-center text-center",
				compact ? "px-4 py-8" : "px-6 py-16",
			)}
		>
			<div
				data-testid="empty-state-icon"
				className="flex size-12 items-center justify-center surface-steel rounded-lg border border-border bg-app-band shadow-e1"
			>
				<Icon aria-hidden="true" className="size-5 text-text-muted" />
			</div>
			{eyebrow ? (
				<p
					data-testid="empty-state-eyebrow"
					className="mt-5 inline-flex items-center rounded-full border border-dashed border-border-strong px-2.5 py-0.5 type-caption text-text-muted"
				>
					{eyebrow}
				</p>
			) : null}
			<h2
				data-testid="empty-state-title"
				className={cn(
					"max-w-md type-h2 text-balance text-foreground",
					eyebrow ? "mt-3" : "mt-5",
				)}
			>
				{title}
			</h2>
			<p
				data-testid="empty-state-description"
				className="mt-2 max-w-md type-body text-pretty text-text-muted"
			>
				{description}
			</p>
			{needs.length > 0 ? (
				<div
					data-testid="empty-state-needs"
					className="mt-6 flex w-full max-w-xs flex-wrap items-center justify-center gap-2 border-t border-border pt-4"
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
				<div data-testid="empty-state-action" className="mt-6">
					{action}
				</div>
			) : null}
		</div>
	);
}
