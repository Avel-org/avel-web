import type { GatePolicy } from "avel-server/contract";
import { cn } from "@/lib/utils";

/**
 * A gate's policy as a shape, the same on the Playbook canvas and the gate
 * panel. Mandatory must pass: a filled neutral diamond, a rule and never a
 * failure, so never the block tone (audit §4). Warn may pass with a warning:
 * a hollow chevron in the warn tone.
 */
export function GatePolicyGlyph({
	policy,
	className,
}: {
	policy: GatePolicy;
	className?: string;
}) {
	return (
		<svg
			aria-hidden="true"
			viewBox="0 0 24 24"
			className={cn("size-6 shrink-0", className)}
		>
			{policy === "mandatory" ? (
				<path
					data-glyph="stop"
					d="M 12 4 L 20 12 L 12 20 L 4 12 z"
					className="fill-text-muted"
				/>
			) : (
				<path
					data-glyph="pass"
					d="M 4 6 L 12 12 L 4 18 M 10 6 L 18 12 L 10 18"
					fill="none"
					strokeWidth={1.75}
					className="stroke-gate-warn"
				/>
			)}
		</svg>
	);
}
