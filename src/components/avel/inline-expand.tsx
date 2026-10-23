import { ChevronDown } from "lucide-react";
import { type ReactNode, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/*
 * A long list that opens in place (ruling 35): the first few items, then
 * "Show 4 more gates". The rest open on the grid-row animation the mission
 * details sections use, and are inert while closed, so neither focus nor a
 * screen reader reaches what isn't shown.
 */

/** "Show 1 more gate", "Show 4 more gates"; the noun is plural. */
export function showMoreLabel(hidden: number, noun: string): string {
	const singular = noun.endsWith("s") ? noun.slice(0, -1) : noun;
	return `Show ${hidden} more ${hidden === 1 ? singular : noun}`;
}

export function InlineExpand<T>({
	items,
	visible = 3,
	getKey,
	render,
	noun,
	className,
	"data-testid": testId,
}: {
	items: readonly T[];
	/** How many show before "Show more". */
	visible?: number;
	getKey: (item: T) => string;
	render: (item: T) => ReactNode;
	/** What the items are, plural: "gates", "agents". */
	noun: string;
	className?: string;
	"data-testid": string;
}) {
	const [open, setOpen] = useState(false);
	const restId = useId();
	const head = items.slice(0, visible);
	const rest = items.slice(visible);
	return (
		<div data-testid={testId} data-open={open} className="flex flex-col">
			<ul className={cn("flex flex-col", className)}>
				{head.map((item) => (
					<li key={getKey(item)}>{render(item)}</li>
				))}
			</ul>
			{rest.length > 0 ? (
				<>
					<div
						className={cn(
							"grid transition-[grid-template-rows] duration-(--duration-state) ease-avel",
							open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
						)}
					>
						<div
							id={restId}
							// Open, the clip leaves room for a row's focus ring (2px gap
							// and 2px ring); closed, nothing may show past the fold.
							className={cn(
								"min-h-0",
								open
									? "overflow-clip [overflow-clip-margin:4px]"
									: "overflow-hidden",
							)}
							inert={!open}
						>
							<ul
								data-testid={`${testId}-rest`}
								className={cn("flex flex-col", className)}
							>
								{rest.map((item) => (
									<li key={getKey(item)}>{render(item)}</li>
								))}
							</ul>
						</div>
					</div>
					<Button
						variant="ghost"
						size="sm"
						aria-expanded={open}
						aria-controls={restId}
						data-testid={`${testId}-toggle`}
						onClick={() => setOpen(!open)}
						className="mt-1 self-start text-accent-text"
					>
						<ChevronDown
							aria-hidden="true"
							className={cn(
								"transition-transform duration-(--duration-state) ease-avel",
								open && "rotate-180",
							)}
						/>
						{open ? "Show fewer" : showMoreLabel(rest.length, noun)}
					</Button>
				</>
			) : null}
		</div>
	);
}
