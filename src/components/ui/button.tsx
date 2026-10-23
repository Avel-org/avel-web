import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import * as React from "react";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

// Variant names are shadcn's; the looks are design system v3's `.btn`.
// Every button is a 10px-radius control, 32px tall by default (28 small, 38
// large), 14px at weight 500 with 16px icons. `default` is the primary face,
// the primary gradient and glow. Destructive is outlined wherever it sits
// beside other work, because a filled red button attracts the click it should
// discourage. `destructive-confirm` is the one filled danger (audit D7,
// adopted): the last button of a dialog that has already named the effect.
//
// Disabled is v3 UX 6: flat, neutral and legible, at full opacity. The
// reason (disabledReason) sits beside it at full contrast.
//
// The base sets the 1px border's width only. Each variant names its edge
// colour: a base border-transparent would sit after btn-primary-face in the
// compiled CSS (single-property utilities come last) and erase its border.
const buttonVariants = cva(
	"inline-flex shrink-0 items-center justify-center gap-1.5 rounded-control border type-body font-medium whitespace-nowrap transition-[background-color,border-color,box-shadow,filter,transform] duration-(--duration-micro) ease-avel disabled:pointer-events-none disabled:border-border disabled:bg-app-raised disabled:text-text-subtle disabled:shadow-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
	{
		variants: {
			variant: {
				default: "btn-primary-face",
				destructive:
					"border-gate-block-line bg-transparent text-gate-block hover:bg-gate-block-soft active:translate-y-[0.5px]",
				"destructive-confirm": "btn-danger-face",
				outline:
					"border-border-strong bg-app-panel bg-clip-padding text-text shadow-btn hover:bg-app-raised active:translate-y-[0.5px]",
				secondary:
					"border-border-strong bg-app-panel bg-clip-padding text-text shadow-btn hover:bg-app-raised active:translate-y-[0.5px]",
				ghost:
					"border-transparent text-text hover:bg-app-raised active:translate-y-[0.5px]",
				link: "border-0 text-accent-text underline-offset-3 hover:underline disabled:bg-transparent",
				// One option of a segmented control (v3 .segmented): quiet at
				// rest, a chip above the track when pressed. The track is
				// tabsListVariants' default.
				segment:
					"border-transparent text-text-muted hover:text-text aria-pressed:border-border aria-pressed:bg-chip aria-pressed:text-text aria-pressed:shadow-btn",
			},
			size: {
				default: "h-control-md px-3",
				sm: "h-control-sm px-2.5 type-small",
				lg: "h-control-lg px-4",
				icon: "size-control-md",
				// 24px: the smallest hit target v3 allows (UX 1), for icons
				// inside dense rows. Its icon is the small 14px size.
				"icon-xs": "size-tile-sm [&_svg:not([class*='size-'])]:size-3.5",
				"icon-sm": "size-control-sm",
			},
		},
		compoundVariants: [
			// A link is text, not a box: no height or padding of its own, but
			// still a 24px target (v3 UX 1).
			{ variant: "link", class: "h-auto min-h-6 px-0" },
			// 24px inside the track's 3px padding and 1px edge, so the track is
			// 32px, a control's height; the chip's radius follows
			// the track's (10 - 3, the nearest token being 6).
			{ variant: "segment", class: "h-6 rounded-sm px-2.5 type-small" },
		],
		defaultVariants: {
			variant: "default",
			size: "default",
		},
	},
);

// Matches --duration-state. A timer cannot read a CSS variable without
// freezing it, and this one never changes with the theme.
const HOLD_MS = 320;

type ButtonProps = React.ComponentProps<"button"> &
	VariantProps<typeof buttonVariants> & {
		asChild?: boolean;
		/**
		 * Disables the button and prints why beside it. A button that cannot act
		 * is disabled by state with its reason visible, never greyed silently.
		 */
		disabledReason?: string;
	} & (
		| { holdToConfirm?: false; onConfirm?: never }
		| {
				/**
				 * For deliver and abort. The action fires only after the button is
				 * held for 320ms by pointer, Space or Enter. A plain click does
				 * nothing, so it cannot be triggered by accident.
				 */
				holdToConfirm: true;
				onConfirm: () => void;
				asChild?: false;
		  }
	);

function useHold(onConfirm: (() => void) | undefined, enabled: boolean) {
	const timer = React.useRef<number | undefined>(undefined);
	const [holding, setHolding] = React.useState(false);

	const cancel = React.useCallback(() => {
		window.clearTimeout(timer.current);
		timer.current = undefined;
		setHolding(false);
	}, []);

	React.useEffect(() => cancel, [cancel]);

	const start = () => {
		if (!enabled || timer.current !== undefined) return;
		setHolding(true);
		timer.current = window.setTimeout(() => {
			timer.current = undefined;
			setHolding(false);
			onConfirm?.();
		}, HOLD_MS);
	};

	const isConfirmKey = (key: string) => key === " " || key === "Enter";

	return {
		holding,
		handlers: {
			onPointerDown: (event: React.PointerEvent) => {
				if (event.button === 0) start();
			},
			onPointerUp: cancel,
			onPointerLeave: cancel,
			onPointerCancel: cancel,
			onKeyDown: (event: React.KeyboardEvent) => {
				if (!isConfirmKey(event.key)) return;
				event.preventDefault();
				if (!event.repeat) start();
			},
			onKeyUp: (event: React.KeyboardEvent) => {
				if (isConfirmKey(event.key)) cancel();
			},
			onClick: (event: React.MouseEvent) => event.preventDefault(),
		},
	};
}

function Button({
	className,
	variant = "default",
	size = "default",
	asChild = false,
	disabledReason,
	holdToConfirm = false,
	onConfirm,
	disabled,
	children,
	...props
}: ButtonProps) {
	const reasonId = React.useId();
	const isDisabled = disabled === true || disabledReason !== undefined;
	const hold = useHold(onConfirm, holdToConfirm && !isDisabled);
	const Comp = asChild ? Slot.Root : "button";

	const button = (
		<Comp
			data-slot="button"
			data-variant={variant}
			data-size={size}
			data-holding={hold.holding || undefined}
			className={cn(
				buttonVariants({ variant, size, className }),
				// isolate: Safari clips a transformed child to the radius only
				// inside its own stacking context, so the fill follows the corners.
				holdToConfirm && "relative isolate overflow-hidden",
			)}
			{...props}
			disabled={isDisabled}
			aria-describedby={
				disabledReason === undefined ? props["aria-describedby"] : reasonId
			}
			{...(holdToConfirm ? hold.handlers : {})}
		>
			{holdToConfirm ? (
				<>
					<span
						aria-hidden="true"
						data-slot="button-hold-fill"
						className={cn(
							"pointer-events-none absolute inset-0 origin-left bg-current/15",
							hold.holding
								? "scale-x-100 transition-transform duration-(--duration-state) ease-avel"
								: "scale-x-0",
						)}
					/>
					{children}
					<span className="sr-only">, press and hold to confirm</span>
				</>
			) : (
				children
			)}
		</Comp>
	);

	if (disabledReason === undefined) return button;

	return (
		<DisabledReason reason={disabledReason} reasonId={reasonId}>
			{button}
		</DisabledReason>
	);
}

/**
 * A disabled button's reason, shown in a tooltip (AVEL-DESIGN.md ruling 11).
 * A disabled button receives no pointer or focus events, so the trigger is a
 * focusable wrapper: hover, keyboard focus and a tap all open it. The reason
 * is also in the markup as a visually hidden span that the button names in
 * aria-describedby, so a screen reader gets it without opening anything.
 */
function DisabledReason({
	reason,
	reasonId,
	children,
}: {
	reason: string;
	reasonId: string;
	children: React.ReactNode;
}) {
	const [open, setOpen] = React.useState(false);
	return (
		<>
			<Tooltip open={open} onOpenChange={setOpen}>
				<TooltipTrigger asChild>
					<span
						data-slot="button-with-reason"
						// biome-ignore lint/a11y/noNoninteractiveTabindex: the disabled button inside cannot take focus, so this wrapper is how a keyboard reaches its reason.
						tabIndex={0}
						aria-describedby={reasonId}
						// A full-width control keeps its width inside the wrapper.
						className="inline-flex cursor-not-allowed rounded-control has-[>.w-full]:flex has-[>.w-full]:w-full"
						onPointerDown={(event) => {
							// Touch has no hover. A tap toggles the reason, and Radix's
							// own pointerdown handling, which closes it, is skipped.
							if (event.pointerType !== "touch") return;
							event.preventDefault();
							setOpen((wasOpen) => !wasOpen);
						}}
					>
						{children}
					</span>
				</TooltipTrigger>
				<TooltipContent sideOffset={6}>{reason}</TooltipContent>
			</Tooltip>
			<span id={reasonId} data-slot="button-reason" className="sr-only">
				{reason}
			</span>
		</>
	);
}

export { Button, buttonVariants, DisabledReason };
