import { Info } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/*
 * Why a control is off, printed where it can be read without hovering
 * (v3 UX 6, .reason): a caption in the muted ink, which keeps full contrast
 * beside a control gone flat, after a 13px icon in the subtle ink. The
 * control keeps the same words in its tooltip and aria-describedby.
 */
export function Reason({
	children,
	"data-testid": testId,
	className,
}: {
	children: ReactNode;
	"data-testid"?: string;
	className?: string;
}) {
	return (
		<p
			data-testid={testId}
			data-slot="reason"
			className={cn(
				"inline-flex items-center gap-1.5 type-caption text-text-muted",
				className,
			)}
		>
			<Info
				aria-hidden="true"
				className="size-[13px] shrink-0 text-text-subtle"
			/>
			{children}
		</p>
	);
}
