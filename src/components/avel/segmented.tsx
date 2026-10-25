import type { LucideIcon } from "lucide-react";
import {
	type ReactNode,
	type RefObject,
	useEffect,
	useRef,
	useState,
} from "react";
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
 *
 * The pressed chip slides from one option to the next (section 4's state
 * duration, the tab indicator's motion), so a change of filter is seen to
 * move rather than blink. It is one chip drawn behind the segments,
 * measured in the browser; until it is measured (and in a server render)
 * the pressed segment draws its own chip, so nothing is ever unmarked.
 * Reduced motion places it without the slide.
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
	const track = useRef<HTMLFieldSetElement>(null);
	const chip = usePressedChip(track);
	return (
		<fieldset
			ref={track}
			data-testid={testId}
			data-indicator={chip ? "ready" : undefined}
			className={cn(
				tabsListVariants({ variant: "default" }),
				// A wrapped row starts at the left edge, under the first segment,
				// not centred under the row above.
				"relative max-w-full flex-wrap justify-start",
				// Once the sliding chip is measured it is the pressed look, so
				// the pressed segment (or a pressed trailing control) stops
				// drawing its own; every segment sits above the chip.
				"[&>button]:relative [&>[data-slot=button-with-reason]]:relative",
				"[&[data-indicator=ready]>[aria-pressed=true]]:border-transparent [&[data-indicator=ready]>[aria-pressed=true]]:bg-transparent [&[data-indicator=ready]>[aria-pressed=true]]:shadow-none",
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
			<span
				aria-hidden="true"
				data-slot="segment-chip"
				data-animate={chip?.animate || undefined}
				style={
					chip
						? {
								transform: `translate(${chip.x}px, ${chip.y}px)`,
								width: chip.width,
								height: chip.height,
							}
						: undefined
				}
				className={cn(
					"pointer-events-none absolute top-0 left-0 rounded-sm border border-border bg-chip shadow-btn",
					"data-animate:transition-[transform,width,height] data-animate:duration-(--duration-state) data-animate:ease-avel motion-reduce:transition-none",
					chip ? "opacity-100" : "opacity-0",
				)}
			/>
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

type ChipBox = {
	x: number;
	y: number;
	width: number;
	height: number;
	animate: boolean;
};

/**
 * Where the pressed chip goes: over the pressed control among the track's
 * own children, re-measured when the choice changes or the track resizes
 * (it wraps). The first measure places it without moving; later ones slide.
 * Nothing pressed (a choice held by a trailing control that is not pressed)
 * hides it.
 */
function usePressedChip(
	ref: RefObject<HTMLFieldSetElement | null>,
): ChipBox | null {
	const [box, setBox] = useState<ChipBox | null>(null);
	useEffect(() => {
		const track = ref.current;
		if (!track) return;
		const measure = () => {
			const pressed = track.querySelector<HTMLElement>(
				':scope > [aria-pressed="true"]',
			);
			if (!pressed) return setBox(null);
			// From the boxes, inside the track's border: offsetLeft counted
			// the border and set the chip a pixel off its segment.
			const at = pressed.getBoundingClientRect();
			const from = track.getBoundingClientRect();
			setBox((previous) => ({
				x: at.left - from.left - track.clientLeft,
				y: at.top - from.top - track.clientTop,
				width: at.width,
				height: at.height,
				animate: previous !== null,
			}));
		};
		measure();
		const resize = new ResizeObserver(measure);
		resize.observe(track);
		const presses = new MutationObserver(measure);
		presses.observe(track, {
			subtree: true,
			attributes: true,
			attributeFilter: ["aria-pressed"],
		});
		return () => {
			resize.disconnect();
			presses.disconnect();
		};
	}, [ref]);
	return box;
}
