import type * as React from "react";
import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
	return (
		<input
			type={type}
			data-slot="input"
			className={cn(
				"h-9 w-full min-w-0 field-inset rounded-xs border border-input bg-app-field px-3 py-1 text-base transition-colors duration-(--duration-micro) ease-avel  selection:bg-accent-soft file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-text-subtle disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-(--opacity-disabled) md:text-sm",
				"",
				// Focus is the border stepping up, not a ring (operator request; app.css
				// removes the outline from text fields). The rest border is already
				// border-strong (--color-input), so the step goes to text-muted: 3.54:1
				// against the rest border in dark, 5.62:1 in light.
				"focus-visible:border-text-muted focus-visible:bg-app-raised",
				"aria-invalid:border-destructive",
				className,
			)}
			{...props}
		/>
	);
}

export { Input };
