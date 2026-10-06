import type * as React from "react";
import { cn } from "@/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
	return (
		<textarea
			data-slot="textarea"
			className={cn(
				"flex field-sizing-content min-h-16 w-full field-inset rounded-xs border border-input bg-app-field px-3 py-2 text-base transition-colors duration-(--duration-micro) ease-avel  placeholder:text-text-subtle focus-visible:border-text-muted focus-visible:bg-app-raised disabled:cursor-not-allowed disabled:opacity-(--opacity-disabled) aria-invalid:border-destructive md:text-sm",
				className,
			)}
			{...props}
		/>
	);
}

export { Textarea };
