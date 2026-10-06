import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * The dashed pill on every sample section (ruling 29). Its tooltip names the
 * route the section waits for; screen readers get the same words. Each page
 * names its routes in its own placeholder module (mission-placeholders.ts,
 * catalog-placeholders.ts), so `missing` is a plain string here.
 */
export function SampleData({ missing }: { missing: string }) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				{/* A button so keyboard users can reach the tooltip; it does nothing
				    else. Screen readers hear the route in its name. */}
				<button
					type="button"
					data-testid="sample-data"
					data-missing={missing}
					className="inline-flex shrink-0 cursor-default items-center self-start rounded-full border border-dashed border-border-strong px-2 py-0.5 type-caption text-text-muted"
				>
					Sample data
					<span className="sr-only">
						{`, placeholder until avel-server has ${missing}`}
					</span>
				</button>
			</TooltipTrigger>
			<TooltipContent>{`Placeholder until avel-server has ${missing}.`}</TooltipContent>
		</Tooltip>
	);
}
