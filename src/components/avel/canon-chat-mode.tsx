import { CANON_MODES, type CanonMode } from "avel-server/contract";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { tabsListVariants } from "@/components/ui/tabs";
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

/** Why a mode can't be chosen here, or undefined when it can. */
export function canonModeBlocked(
	mode: CanonMode,
	hasIntake: boolean,
): string | undefined {
	if (mode === "draft" && !hasIntake)
		return "Draft needs an intake. Brief one from its intake page.";
	return undefined;
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
	return (
		<Badge
			variant="outline"
			data-testid={testId}
			data-mode={mode}
			title={CANON_MODE_COPY[mode].hint}
			className={className}
		>
			{CANON_MODE_COPY[mode].label}
		</Badge>
	);
}

/**
 * Ask | Fetch | Draft, v3's segmented control at the composer's 28px tool
 * height. A mode that can't be chosen stays visible, disabled with its
 * reason (ruling 11), so the operator learns it exists and what it needs.
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
	return (
		<fieldset
			data-testid="canon-mode"
			className={cn(
				tabsListVariants({ variant: "default" }),
				"p-0.5",
				className,
			)}
		>
			<legend className="sr-only">Mode</legend>
			{CANON_MODES.map((mode) => {
				const pressed = value === mode;
				const blocked = canonModeBlocked(mode, hasIntake);
				return (
					<Button
						key={mode}
						type="button"
						variant="segment"
						size="sm"
						aria-pressed={pressed}
						data-testid={`canon-mode-${mode}`}
						title={blocked ? undefined : CANON_MODE_COPY[mode].hint}
						// The pressed mode is never disabled: it shows what is in use.
						disabledReason={pressed ? undefined : (blocked ?? disabledReason)}
						onClick={() => {
							if (!pressed) onChange(mode);
						}}
					>
						{CANON_MODE_COPY[mode].label}
					</Button>
				);
			})}
		</fieldset>
	);
}
