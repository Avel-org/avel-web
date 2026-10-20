import { cn } from "@/lib/utils";

/**
 * The A. mark: a v3 .tile in the primary button's bottom stop. Static: v3
 * has no motion at rest. Decorative: whatever carries it names the product
 * in text. A logotype is exempt from WCAG 1.4.3, but it sits beside text, so
 * it keeps the 3:1 graphic floor: white on bg-accent was 2.1:1 in dark;
 * on the bottom stop it is 3.15:1 in both themes.
 */
export function BrandMark({ size = "md" }: { size?: "md" | "lg" }) {
	return (
		<span
			aria-hidden="true"
			data-testid="brand-mark"
			className={cn(
				"flex shrink-0 items-center justify-center bg-btn-primary-bottom font-sans text-text-on-solid",
				size === "lg"
					? "size-12 rounded-card type-display"
					: "size-tile-md rounded-tile type-title font-semibold",
			)}
		>
			A.
		</span>
	);
}
