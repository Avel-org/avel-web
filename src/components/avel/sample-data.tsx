import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * The dashed pill on every sample section (ruling 29). Its tooltip names the
 * route the section waits for; screen readers get the same words. Each page
 * names its routes in its own placeholder module (mission-placeholders.ts,
 * catalog-placeholders.ts), so `missing` is a plain string here.
 */
export function SampleData({
	missing,
	reason,
	className,
}: {
	missing: string;
	/**
	 * Why the region is a sample, when it is not that avel-server lacks the
	 * route: say the route exists and this page is not wired to it yet.
	 */
	reason?: string;
	/** The pill's own colours, on a surface the theme tokens don't suit. */
	className?: string;
}) {
	// Without a reason, the words are exactly the mission page's, unchanged.
	const words = reason ?? `Placeholder until avel-server has ${missing}.`;
	const spoken = reason ?? `placeholder until avel-server has ${missing}`;
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				{/* A button so keyboard users can reach the tooltip; it does nothing
				    else. Screen readers hear the route in its name. */}
				<button
					type="button"
					data-testid="sample-data"
					data-missing={missing}
					className={cn(
						"inline-flex shrink-0 cursor-default items-center self-start rounded-full border border-dashed border-border-strong px-2 py-0.5 type-caption text-text-muted",
						className,
					)}
				>
					Sample data
					<span className="sr-only">{`, ${spoken}`}</span>
				</button>
			</TooltipTrigger>
			<TooltipContent>{words}</TooltipContent>
		</Tooltip>
	);
}
