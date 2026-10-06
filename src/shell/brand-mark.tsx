import { cn } from "@/lib/utils";

/**
 * The A. mark. Its period is the one loop at rest (AVEL-DESIGN.md section 4).
 * Decorative: whatever carries it names the product in text.
 */
export function BrandMark({ size = "md" }: { size?: "md" | "lg" }) {
	return (
		<span
			aria-hidden="true"
			data-testid="brand-mark"
			className={cn(
				"flex shrink-0 items-center justify-center rounded-sm bg-accent font-display font-semibold text-accent-ink",
				size === "lg" ? "size-12 rounded-md text-2xl" : "size-8 text-base",
			)}
		>
			A<span className="animate-period">.</span>
		</span>
	);
}
