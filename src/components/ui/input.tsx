import type * as React from "react";
import { cn } from "@/lib/utils";

// v3 .field: a 32px box on the field surface with a strong hairline. Focus
// is field-surface's solid 1px ring and soft halo (v3 UX 2), since app.css
// takes the outline off text fields; invalid is the same ring in block.
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
	return (
		<input
			type={type}
			data-slot="input"
			className={cn(
				"field-surface h-control-md w-full min-w-0 rounded-control px-2.5 type-body text-text transition-[background-color,border-color,box-shadow] duration-(--duration-micro) ease-avel file:inline-flex file:h-7 file:border-0 file:bg-transparent file:type-small file:font-medium file:text-text placeholder:text-text-subtle disabled:cursor-not-allowed disabled:bg-app-raised disabled:text-text-subtle",
				className,
			)}
			{...props}
		/>
	);
}

export { Input };
