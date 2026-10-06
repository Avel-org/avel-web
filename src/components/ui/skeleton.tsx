import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="skeleton"
			className={cn("skeleton-pulse rounded-xs bg-skeleton", className)}
			{...props}
		/>
	);
}

export { Skeleton };
