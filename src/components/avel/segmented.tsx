import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { tabsListVariants } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

/*
 * One segmented filter (v3 .segmented): a fieldset track of segment
 * Buttons, the chosen one pressed. Every filter row in the app draws it
 * from here, so they share one height, one count style and one order (All
 * first, as an option whose value is undefined). The legend is read by
 * screen readers; shown, it sits inside the track, so two rows that both
 * start "All" never read as the same control. The track wraps rather than
 * overflow a narrow panel.
 */

export type SegmentOption<V extends string> = {
	/** Undefined is All: no filter. */
	value: V | undefined;
	label: string;
	/**
	 * The rows this option would show. Omitted, the segment has no count;
	 * null, the count is not known yet and reads as a dash.
	 */
	count?: number | null;
	icon?: LucideIcon;
};

export function Segmented<V extends string>({
	legend,
	showLegend = false,
	options,
	value,
	onChange,
	className,
	children,
	"data-testid": testId,
}: {
	legend: string;
	/** Print the legend inside the track, before the first segment. */
	showLegend?: boolean;
	options: readonly SegmentOption<V>[];
	value: V | undefined;
	onChange: (value: V | undefined) => void;
	className?: string;
	/** Trailing controls inside the track, after the last segment. */
	children?: ReactNode;
	/** The fieldset; each segment is `${testId}-${value ?? "all"}`. */
	"data-testid": string;
}) {
	return (
		<fieldset
			data-testid={testId}
			className={cn(
				tabsListVariants({ variant: "default" }),
				// A wrapped row starts at the left edge, under the first segment,
				// not centred under the row above.
				"max-w-full flex-wrap justify-start",
				className,
			)}
		>
			<legend
				className={
					showLegend
						? "float-left flex h-6 items-center pr-1.5 pl-2 type-eyebrow"
						: "sr-only"
				}
			>
				{legend}
			</legend>
			{options.map((option) => {
				const id = option.value ?? "all";
				return (
					<Button
						key={id}
						type="button"
						variant="segment"
						aria-pressed={option.value === value}
						data-testid={`${testId}-${id}`}
						onClick={() => onChange(option.value)}
					>
						{option.icon ? <option.icon aria-hidden="true" /> : null}
						{option.label}
						{option.count === undefined ? null : (
							<span
								data-testid={`${testId}-${id}-count`}
								// The pressed segment's count lifts with its label.
								className="type-mono text-text-subtle tabular-nums in-aria-pressed:text-text-muted"
							>
								{option.count === null ? (
									<>
										<span aria-hidden="true">—</span>
										<span className="sr-only">, count not available</span>
									</>
								) : (
									option.count
								)}
							</span>
						)}
					</Button>
				);
			})}
			{children}
		</fieldset>
	);
}
