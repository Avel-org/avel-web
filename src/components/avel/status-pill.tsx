import type { ExportStatus } from "avel-server/contract";
import { cn } from "@/lib/utils";

/**
 * A state, as a glyph and a word (AVEL-DESIGN.md section 2). Colour never
 * carries the meaning alone: every pill has its label, and every tone has its
 * own glyph shape, so the state still reads in greyscale.
 *
 *   pass, block, warn   filled ring
 *   pending             empty ring
 *   stale               ring with a broken segment
 *
 * `attested` draws the ring dashed: a mechanical result is a solid ring, an
 * attested one is dashed (section 2), so a claim never looks like a check.
 */
export type StatusTone = "pass" | "block" | "warn" | "pending" | "stale";

const TONE: Record<StatusTone, string> = {
	pass: "border-gate-pass-line bg-gate-pass-soft text-gate-pass",
	block: "border-gate-block-line bg-gate-block-soft text-gate-block",
	warn: "border-gate-warn-line bg-gate-warn-soft text-gate-warn",
	pending: "border-gate-pending-line bg-gate-pending-soft text-gate-pending",
	stale: "border-gate-stale-line bg-gate-stale-soft text-gate-stale",
};

/** The glyph alone, for places where the word is already beside it. */
export function StatusGlyph({
	tone,
	attested = false,
	className,
}: {
	tone: StatusTone;
	attested?: boolean;
	className?: string;
}) {
	const filled = tone === "pass" || tone === "block" || tone === "warn";
	return (
		<svg
			aria-hidden="true"
			viewBox="0 0 12 12"
			data-slot="status-glyph"
			data-tone={tone}
			data-attested={attested || undefined}
			className={cn("size-3 shrink-0", className)}
		>
			{tone === "stale" ? (
				// A ring with a quarter missing at the top right.
				<path
					d="M6 1.5 A4.5 4.5 0 1 0 10.5 6"
					fill="none"
					stroke="currentColor"
					strokeWidth="1.5"
					strokeLinecap="round"
					strokeDasharray={attested ? "1.6 1.6" : undefined}
				/>
			) : (
				<circle
					cx="6"
					cy="6"
					r="4.5"
					fill="none"
					stroke="currentColor"
					strokeWidth="1.5"
					strokeDasharray={attested ? "1.6 1.6" : undefined}
				/>
			)}
			{filled ? <circle cx="6" cy="6" r="2.25" fill="currentColor" /> : null}
		</svg>
	);
}

export function StatusPill({
	tone,
	label,
	attested = false,
	size = "md",
	className,
	"data-testid": testId = "status-pill",
}: {
	tone: StatusTone;
	/** The word. Required: a pill is never colour alone. */
	label: string;
	attested?: boolean;
	size?: "sm" | "md";
	className?: string;
	"data-testid"?: string;
}) {
	return (
		<span
			data-testid={testId}
			data-tone={tone}
			className={cn(
				"inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full border font-medium whitespace-nowrap",
				size === "sm" ? "h-5 px-1.5 text-xs" : "h-6 px-2 text-xs",
				TONE[tone],
				className,
			)}
		>
			<StatusGlyph tone={tone} attested={attested} />
			{label}
		</span>
	);
}

/**
 * Each export status (avel-server's contract, src/contract/shared/status.ts)
 * mapped to a tone: in motion is pending, waiting on a person is warn, done
 * is pass, failed is block, and closed (a pull request closed without
 * merging) is stale: it ended without shipping, but nothing in the system
 * failed (AVEL-DESIGN.md ruling 27).
 *
 * Keyed on the contract's union with `satisfies`, so a status the server
 * adds fails this build until it has a tone, and a status it removes fails
 * it until the tone goes.
 */
export const EXPORT_STATUS_TONE = {
	pending: "pending",
	rendering: "pending",
	verifying: "pending",
	previewing: "pending",
	delivering: "pending",
	previewed: "warn",
	"pr-open": "warn",
	done: "pass",
	closed: "stale",
	failed: "block",
} as const satisfies Record<ExportStatus, StatusTone>;

export type { ExportStatus };

export function exportStatusTone(status: ExportStatus): StatusTone {
	return EXPORT_STATUS_TONE[status];
}
