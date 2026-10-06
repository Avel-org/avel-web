import { type ComponentProps, type ReactNode, useId } from "react";
import { cn } from "@/lib/utils";

/**
 * A titled panel on a page (AVEL-DESIGN.md section 10). The header strip sits
 * on the band surface, one step above the panel, so the title reads as a
 * header rather than as the panel's first row. The title is an h2 because the
 * top bar owns the page's h1.
 */
export function SectionPanel({
	title,
	description,
	actions,
	children,
	className,
	"data-testid": testId = "section-panel",
	...props
}: Omit<ComponentProps<"section">, "title"> & {
	title: string;
	description?: string;
	actions?: ReactNode;
	children: ReactNode;
	"data-testid"?: string;
}) {
	const titleId = useId();
	return (
		<section
			aria-labelledby={titleId}
			data-testid={testId}
			className={cn(
				"overflow-hidden rounded-md border border-border bg-app-panel shadow-e1",
				className,
			)}
			{...props}
		>
			<header
				data-testid="section-panel-header"
				className="surface-steel flex items-center justify-between gap-4 border-b border-border bg-app-band px-4 py-2.5"
			>
				<div className="flex min-w-0 flex-col">
					<h2 id={titleId} className="type-panel-title text-foreground">
						{title}
					</h2>
					{description ? <p className="type-caption">{description}</p> : null}
				</div>
				{actions ? (
					<div className="flex shrink-0 items-center gap-2">{actions}</div>
				) : null}
			</header>
			<div data-testid="section-panel-body" className="p-4">
				{children}
			</div>
		</section>
	);
}
