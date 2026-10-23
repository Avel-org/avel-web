import type { ExportStatus, ExportWire } from "avel-server/contract";
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
 *
 * The pill is v3's: a soft ground in the tone, the word in its text colour,
 * and in dark, where the soft ground nearly vanishes, an inset ring from the
 * tone's line. The glyph keeps its shape inside it (audit D2): the shape
 * carries the meaning, the colour repeats it.
 */
export type StatusTone = "pass" | "block" | "warn" | "pending" | "stale";

const TONE: Record<StatusTone, string> = {
	pass: "bg-gate-pass-soft text-gate-pass ring-gate-pass-line",
	block: "bg-gate-block-soft text-gate-block ring-gate-block-line",
	warn: "bg-gate-warn-soft text-gate-warn ring-gate-warn-line",
	pending: "bg-gate-pending-soft text-gate-pending ring-gate-pending-line",
	stale: "bg-gate-stale-soft text-gate-stale ring-gate-stale-line",
};

/**
 * A tone's text colour, which is also its glyph's: StatusGlyph draws in
 * currentColor, so a glyph outside a pill takes its ink from here.
 */
export const TONE_TEXT = {
	pass: "text-gate-pass",
	block: "text-gate-block",
	warn: "text-gate-warn",
	pending: "text-gate-pending",
	stale: "text-gate-stale",
} as const satisfies Record<StatusTone, string>;

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
				"inline-flex w-fit shrink-0 items-center gap-[5px] rounded-sm type-caption font-medium whitespace-nowrap ring-inset in-[.dark]:ring-1",
				size === "sm" ? "h-5 px-1.5" : "h-[22px] px-2",
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

/** Each export status in words. */
export const EXPORT_STATUS_LABEL = {
	pending: "Pending",
	rendering: "Rendering",
	verifying: "Verifying",
	previewing: "Previewing",
	previewed: "Previewed",
	delivering: "Delivering",
	"pr-open": "PR open",
	done: "Done",
	closed: "Closed",
	failed: "Failed",
} as const satisfies Record<ExportStatus, string>;

/** Where an export delivers, in words. */
export const EXPORT_TARGET_LABEL = {
	zip: "Zip",
	github_pr: "GitHub PR",
	github_push: "GitHub push",
} as const satisfies Record<ExportWire["targetKind"], string>;

export function exportStatusTone(status: ExportStatus): StatusTone {
	return EXPORT_STATUS_TONE[status];
}
