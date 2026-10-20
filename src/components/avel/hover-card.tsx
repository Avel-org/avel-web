import {
	type ReactNode,
	useCallback,
	useEffect,
	useId,
	useRef,
	useState,
} from "react";
import {
	Popover,
	PopoverAnchor,
	PopoverContent,
} from "@/components/ui/popover";

/*
 * A preview on hover or focus (ruling 35), for agent template names, skill
 * tags and Activity actors. Built on Popover, not Radix's hover card, which
 * does not open from the keyboard. The trigger stays what it was, usually a
 * link to the full object: the card is anchored to it, never its trigger, so
 * a click still follows the link. The card holds a preview and no controls,
 * so nothing in it needs the keyboard; it is described to the trigger while
 * open. Esc closes it.
 */

const OPEN_DELAY = 400;
const CLOSE_DELAY = 150;

export function HoverCard({
	trigger,
	children,
	"data-testid": testId,
}: {
	trigger: ReactNode;
	/** The preview: text and values only, no controls. */
	children: ReactNode;
	"data-testid": string;
}) {
	const [open, setOpen] = useState(false);
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const cardId = useId();

	const clear = useCallback(() => {
		if (timer.current) clearTimeout(timer.current);
		timer.current = null;
	}, []);
	const later = (next: boolean, ms: number) => {
		clear();
		timer.current = setTimeout(() => setOpen(next), ms);
	};
	useEffect(() => clear, [clear]);

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverAnchor asChild>
				{/* biome-ignore lint/a11y/noStaticElementInteractions: the span is never focused or clicked itself; it hears hover, focus and Esc bubbling from the trigger inside it, which keeps its own role */}
				<span
					data-testid={testId}
					data-state={open ? "open" : "closed"}
					aria-describedby={open ? cardId : undefined}
					className="inline-flex max-w-full"
					onPointerEnter={() => later(true, OPEN_DELAY)}
					onPointerLeave={() => later(false, CLOSE_DELAY)}
					onFocus={() => later(true, OPEN_DELAY)}
					onBlur={() => later(false, 0)}
					onKeyDown={(event) => {
						if (event.key === "Escape" && open) {
							event.stopPropagation();
							clear();
							setOpen(false);
						}
					}}
				>
					{trigger}
				</span>
			</PopoverAnchor>
			<PopoverContent
				id={cardId}
				role="tooltip"
				data-testid={`${testId}-card`}
				side="bottom"
				align="start"
				className="w-64 p-3"
				// The trigger keeps focus: the card is read, not entered.
				onOpenAutoFocus={(event) => event.preventDefault()}
				onCloseAutoFocus={(event) => event.preventDefault()}
				onPointerEnter={clear}
				onPointerLeave={() => later(false, CLOSE_DELAY)}
			>
				{children}
			</PopoverContent>
		</Popover>
	);
}
