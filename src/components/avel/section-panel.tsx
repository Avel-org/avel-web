import type { ReactNode } from "react";
import { DataPanel } from "./data-panel";

/**
 * A titled region on a detail page (AVEL-DESIGN.md section 10), in the one
 * panel anatomy every page shares (DataPanel): a 48px header with the title,
 * a count when given, the collapse chevron and the actions at its end; the
 * body, its description first; and a footer band for when its data was read
 * (PanelFooter) or its paging. The title is an h2: the top bar owns the h1.
 */
export function SectionPanel({
	title,
	description,
	actions,
	count,
	footer,
	children,
	className,
	"data-testid": testId = "section-panel",
}: {
	title: string;
	description?: string;
	actions?: ReactNode;
	/** A number the section counts; without one the header shows no badge. */
	count?: number;
	footer?: ReactNode;
	children: ReactNode;
	/** Layout only (a grid span). */
	className?: string;
	"data-testid"?: string;
}) {
	return (
		<DataPanel
			data-testid={testId}
			title={title}
			count={count}
			hideCount={count === undefined}
			actions={actions}
			footer={footer}
			className={className}
		>
			<div
				data-testid={`${testId}-content`}
				// What replaces the content (loaded data for its skeleton) fades in.
				data-enter="fade"
				className="flex flex-col gap-3 p-4"
			>
				{description ? (
					<p className="type-small text-text-muted">{description}</p>
				) : null}
				{children}
			</div>
		</DataPanel>
	);
}
