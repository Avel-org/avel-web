import { Lightbulb, X } from "lucide-react";
import type { ComponentProps, ReactNode, RefObject } from "react";
import { Button } from "@/components/ui/button";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { useStoredState } from "@/lib/stored";
import { cn } from "@/lib/utils";
import { useInlineModals } from "./action-modal";

/*
 * The builders' shared canvas (ruling 36: configuration is a working
 * surface): Teams and Playbooks lay their pieces out on one band, explain it
 * once in a hint strip, and keep the inspector in a sheet beside it, so the
 * two builders read as one app.
 */

/**
 * The band on a faint dot grid, every 20px in --color-border-strong so it
 * holds in both themes, at the dialog radius. It is as tall as what is on
 * it, never the viewport: a canvas held to the window drew tall bands of
 * empty space under short content.
 */
export function CanvasSurface({ className, ...props }: ComponentProps<"div">) {
	return (
		<div
			{...props}
			className={cn(
				"flex flex-col gap-3 rounded-dialog border border-border bg-app-band bg-[radial-gradient(var(--color-border-strong)_1px,transparent_1px)] bg-size-[20px_20px] p-3",
				className,
			)}
		/>
	);
}

const HINT = ["shown", "dismissed"] as const;

/** A canvas's first-time hint: shown until dismissed, remembered per browser. */
export function useCanvasHint(key: string): [boolean, () => void] {
	const [hint, setHint] = useStoredState(key, "shown", HINT);
	return [hint === "shown", () => setHint("dismissed")];
}

/** How the canvas works, in one line, with a way to put it away. */
export function CanvasHint({
	children,
	onDismiss,
	"data-testid": testId,
}: {
	/** One line: it ends in an ellipsis when narrow, whole in its tooltip. */
	children: string;
	onDismiss: () => void;
	"data-testid": string;
}) {
	return (
		<div
			data-testid={testId}
			className="flex items-center gap-2.5 rounded-control border border-border bg-app-panel px-3 py-1.5 shadow-card"
		>
			<Lightbulb
				aria-hidden="true"
				className="size-4 shrink-0 text-text-subtle"
			/>
			<p
				title={children}
				className="min-w-0 flex-1 truncate type-small text-text-muted"
			>
				{children}
			</p>
			<Button
				type="button"
				variant="ghost"
				size="icon-xs"
				aria-label="Dismiss the hint"
				data-testid={`${testId}-dismiss`}
				onClick={onDismiss}
			>
				<X aria-hidden="true" />
			</Button>
		</div>
	);
}

/**
 * The inspector: a sheet on the right, opened by the canvas header's
 * Details. Under InlineModals (a server render, a test) an open one renders
 * in place, as the modals do, since the portal mounts only in a browser.
 */
export function DetailsSheet({
	open,
	onOpenChange,
	title,
	description,
	titleRef,
	titleTestId,
	headerAction,
	children,
	"data-testid": testId,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: ReactNode;
	description: ReactNode;
	/** Takes focus on open, in place of the sheet's first control. */
	titleRef?: RefObject<HTMLHeadingElement | null>;
	titleTestId?: string;
	headerAction?: ReactNode;
	children: ReactNode;
	"data-testid": string;
}) {
	const inline = useInlineModals();
	const titleClass = "min-w-0 truncate outline-none";
	if (inline)
		return open ? (
			<section data-testid={testId} aria-label="Details">
				<header className="flex flex-col gap-1.5 px-6 pt-5 pb-4">
					<h2
						ref={titleRef}
						tabIndex={-1}
						data-testid={titleTestId}
						className={cn("type-page text-text", titleClass)}
					>
						{title}
					</h2>
					<p className="type-small text-text-muted">{description}</p>
					{headerAction}
				</header>
				<div className="px-6 pb-6">{children}</div>
			</section>
		) : null;
	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent
				side="right"
				data-testid={testId}
				className="w-full overflow-y-auto sm:max-w-[28rem]"
				onOpenAutoFocus={(event) => {
					if (!titleRef?.current) return;
					event.preventDefault();
					titleRef.current.focus();
				}}
			>
				<SheetHeader>
					<SheetTitle
						ref={titleRef}
						tabIndex={-1}
						data-testid={titleTestId}
						className={titleClass}
					>
						{title}
					</SheetTitle>
					<SheetDescription>{description}</SheetDescription>
					{headerAction ? (
						<div className="flex flex-wrap gap-2 pt-1">{headerAction}</div>
					) : null}
				</SheetHeader>
				<div className="px-6 pb-6">{children}</div>
			</SheetContent>
		</Sheet>
	);
}
