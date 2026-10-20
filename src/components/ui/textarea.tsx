import type * as React from "react";
import { cn } from "@/lib/utils";

// v3 .field, grown to its content. Focus and invalid as Input's.
function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
	return (
		<textarea
			data-slot="textarea"
			className={cn(
				"field-surface flex field-sizing-content min-h-16 w-full rounded-control px-2.5 py-1.5 type-body text-text transition-[border-color,box-shadow] duration-(--duration-micro) ease-avel placeholder:text-text-subtle disabled:cursor-not-allowed disabled:bg-app-raised disabled:text-text-subtle",
				className,
			)}
			{...props}
		/>
	);
}

export { Textarea };
