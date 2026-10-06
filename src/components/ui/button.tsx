import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import * as React from "react";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

// Variant names are shadcn's. AVEL restyles them: destructive is outlined,
// never filled, because a filled red button attracts the click it should
// discourage. Disabled is the real attribute at the disabled-opacity token,
// so a disabled destructive button still reads as destructive.
//
// Every button is a pill (ruling 30): rounded-full at every size, icon
// buttons are circles. Padding is a step wider than shadcn's so a label never
// crowds the curve. Secondary and outline are machined steel (sheen and top
// highlight); the primary stays a solid accent.
const buttonVariants = cva(
	"inline-flex shrink-0 items-center justify-center gap-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors duration-(--duration-micro) ease-avel disabled:pointer-events-none disabled:opacity-(--opacity-disabled) [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
	{
		variants: {
			variant: {
				default:
					"bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/80",
				destructive:
					"border border-gate-block-line text-gate-block hover:bg-gate-block-soft active:bg-gate-block-soft",
				outline:
					"surface-steel border border-border-strong bg-transparent text-foreground hover:bg-state-hover active:bg-state-active",
				secondary:
					"surface-steel border border-border bg-secondary text-secondary-foreground shadow-e1 hover:bg-state-hover active:bg-state-active",
				ghost: "text-foreground hover:bg-state-hover active:bg-state-active",
				link: "text-accent-text underline-offset-4 hover:underline",
			},
			size: {
				default: "h-9 px-5 py-2 has-[>svg]:px-4",
				xs: "h-6 gap-1 px-2.5 text-xs has-[>svg]:px-2 [&_svg:not([class*='size-'])]:size-3",
				sm: "h-8 gap-1.5 px-4 has-[>svg]:px-3",
				lg: "h-10 px-6 has-[>svg]:px-5",
				icon: "size-9",
				"icon-xs": "size-6 [&_svg:not([class*='size-'])]:size-3",
				"icon-sm": "size-8",
				"icon-lg": "size-10",
			},
		},
		defaultVariants: {
			variant: "default",
			size: "default",
		},
	},
);

// Matches --duration-enter. A timer cannot read a CSS variable without
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
				// inside its own stacking context, so the fill follows the pill.
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
								? "scale-x-100 transition-transform duration-(--duration-enter) ease-avel"
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
						className="inline-flex rounded-sm"
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

export { Button, buttonVariants };
