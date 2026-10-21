import { CANON_MODES, type CanonMode } from "avel-server/contract";
import {
	Check,
	ChevronDown,
	DatabaseZap,
	type LucideIcon,
	MessageCircleQuestion,
	PenLine,
	Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/*
 * Canon's modes, which decide the tools a turn gets: ask reads only what is
 * in the prompt, fetch reads the command center's own data, draft writes an
 * intake's brief. "act" comes later. A session has a default mode; each
 * message records the mode it was sent in.
 */

export const CANON_MODE_COPY = {
	ask: {
		label: "Ask",
		hint: "Answers from what you write. Reads no data.",
	},
	fetch: {
		label: "Fetch",
		hint: "Reads the command center's data: clients, missions, dispatches, spend. Never a client's own words.",
	},
	draft: {
		label: "Draft",
		hint: "Writes this intake's brief, questions and team.",
	},
} as const satisfies Record<CanonMode, { label: string; hint: string }>;

/** Each mode's glyph, on the trigger, in the menu and on a message's tag. */
export const CANON_MODE_ICON = {
	ask: MessageCircleQuestion,
	fetch: DatabaseZap,
	draft: PenLine,
} as const satisfies Record<CanonMode, LucideIcon>;

/** Why a mode can't be chosen here, or undefined when it can. */
export function canonModeBlocked(
	mode: CanonMode,
	hasIntake: boolean,
): string | undefined {
	if (mode === "draft" && !hasIntake)
		return "Draft needs an intake. Brief one from its intake page.";
	return undefined;
}

/** The menu's rows: each mode, whether it is the one in use, and why not. */
export function canonModeOptions(value: CanonMode, hasIntake: boolean) {
	return CANON_MODES.map((mode) => ({
		mode,
		selected: mode === value,
		// The mode in use is never blocked: it shows what is in use.
		blocked: mode === value ? undefined : canonModeBlocked(mode, hasIntake),
	}));
}

/** The mode a message was sent in, or a session's default, as a small tag. */
export function CanonModeBadge({
	mode,
	"data-testid": testId,
	className,
}: {
	mode: CanonMode;
	"data-testid"?: string;
	className?: string;
}) {
	const Icon = CANON_MODE_ICON[mode];
	return (
		<Badge
			variant="outline"
			data-testid={testId}
			data-mode={mode}
			title={CANON_MODE_COPY[mode].hint}
			className={cn("gap-1 [&_svg]:size-3", className)}
		>
			<Icon aria-hidden="true" />
			{CANON_MODE_COPY[mode].label}
		</Badge>
	);
}

/**
 * The mode, as a menu on the composer's tool row: the trigger names the mode
 * in use with its glyph; the menu lists every mode with what it reads. A mode
 * that can't be chosen stays listed with its reason (ruling 11), so the
 * operator learns it exists and what it needs; Act is listed as coming.
 */
export function CanonModeSwitch({
	value,
	onChange,
	hasIntake,
	disabledReason,
	className,
}: {
	value: CanonMode;
	onChange: (mode: CanonMode) => void;
	/** Draft needs an intake. */
	hasIntake: boolean;
	/** Why no mode can change now (signed out, Canon answering). */
	disabledReason?: string;
	className?: string;
}) {
	const Icon = CANON_MODE_ICON[value];
	const trigger = (
		<Button
			type="button"
			variant="ghost"
			size="sm"
			data-testid="canon-mode"
			data-mode={value}
			aria-label={`Mode: ${CANON_MODE_COPY[value].label}`}
			disabledReason={disabledReason}
			className={cn(
				"gap-1.5 border-border bg-app-panel pr-2 pl-2.5 text-text shadow-btn disabled:bg-app-panel disabled:text-text-muted",
				className,
			)}
		>
			<Icon aria-hidden="true" className="text-accent-text" />
			{CANON_MODE_COPY[value].label}
			<ChevronDown aria-hidden="true" className="text-text-subtle" />
		</Button>
	);
	// Locked (signed out, Canon answering): the mode in use, and why.
	if (disabledReason !== undefined) return trigger;
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
			<DropdownMenuContent
				align="start"
				side="top"
				sideOffset={8}
				className="w-80 p-1.5"
				data-testid="canon-mode-menu"
			>
				<DropdownMenuLabel className="type-eyebrow text-text-subtle">
					Mode
				</DropdownMenuLabel>
				<DropdownMenuRadioGroup
					value={value}
					onValueChange={(next) => {
						if (next !== value) onChange(next as CanonMode);
					}}
				>
					{canonModeOptions(value, hasIntake).map(
						({ mode, selected, blocked }) => {
							const ModeIcon = CANON_MODE_ICON[mode];
							const off = blocked !== undefined;
							return (
								<DropdownMenuRadioItem
									key={mode}
									value={mode}
									disabled={off}
									data-testid={`canon-mode-${mode}`}
									// The primitive's dot is replaced by a check on the right.
									className={cn(
										"h-auto items-start gap-3 py-2 pr-2.5 pl-2.5 [&>span:first-child]:hidden",
										selected && "bg-selected focus:bg-selected",
									)}
								>
									<span
										aria-hidden="true"
										className={cn(
											"mt-0.5 grid size-7 shrink-0 place-items-center rounded-tile border [&_svg]:size-4",
											off
												? "border-dashed border-border bg-app-well text-text-subtle"
												: selected
													? "border-accent-line bg-accent-soft text-accent-text"
													: "border-border bg-app-well text-accent-text",
										)}
									>
										<ModeIcon />
									</span>
									<span className="flex min-w-0 flex-1 flex-col gap-0.5">
										<span
											className={cn(
												"type-small font-medium",
												off ? "text-text-muted" : "text-text",
											)}
										>
											{CANON_MODE_COPY[mode].label}
										</span>
										<span className="type-caption text-text-muted">
											{blocked ?? CANON_MODE_COPY[mode].hint}
										</span>
									</span>
									{selected ? (
										<Check
											aria-hidden="true"
											className="mt-1.5 size-4 shrink-0 text-accent-text!"
										/>
									) : null}
								</DropdownMenuRadioItem>
							);
						},
					)}
				</DropdownMenuRadioGroup>
				<DropdownMenuSeparator />
				<DropdownMenuItem
					disabled
					data-testid="canon-mode-act"
					className="data-[disabled]:flex-nowrap h-auto items-start gap-3 py-2 pr-3 pl-2.5"
				>
					<span
						aria-hidden="true"
						className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-tile border border-dashed border-border bg-app-well [&_svg]:size-4"
					>
						<Zap />
					</span>
					<span className="flex min-w-0 flex-1 flex-col gap-0.5">
						<span className="type-small font-medium text-text-muted">Act</span>
						<span className="type-caption text-text-muted">
							Coming later: Canon starts and steers missions for you.
						</span>
					</span>
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
