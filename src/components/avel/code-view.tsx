import { Fragment, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export type CodeTone = "key" | "heading";

const TONE: Record<CodeTone | "plain", string> = {
	key: "text-accent-text",
	heading: "font-medium text-foreground",
	plain: "",
};

/**
 * Read-only text with line numbers: a generated identity, a SKILL.md. The
 * numbers are a separate gutter, hidden from screen readers and not
 * selectable, so a copy takes only the text. Lines never wrap, so each number
 * stays beside its line; a long line scrolls the view sideways instead.
 * There is no edit affordance of any kind: what this shows is generated or
 * reviewed elsewhere.
 */
export function CodeView({
	text,
	label,
	footer,
	lineTone,
	className,
	"data-testid": testId,
}: {
	text: string;
	/**
	 * A tone per line: "key" for frontmatter fields and fences, "heading" for
	 * headings. Unset, the text renders as one run, unchanged.
	 */
	lineTone?: (line: string, index: number) => CodeTone | undefined;
	/** What the text is, for screen readers ("Atlas's identity.md"). */
	label: string;
	/** A line under the text, such as its size against a cap. */
	footer?: ReactNode;
	className?: string;
	"data-testid": string;
}) {
	const lines = text.split("\n");
	return (
		<figure
			aria-label={label}
			data-testid={testId}
			className={cn(
				"flex min-w-0 flex-col overflow-hidden rounded-xs border border-border bg-app-recessed",
				className,
			)}
		>
			<div className="app-scroll flex min-h-0 overflow-auto">
				<div
					aria-hidden="true"
					data-testid={`${testId}-gutter`}
					className="sticky left-0 shrink-0 select-none border-r border-border bg-app-recessed py-3 pr-3 pl-3 text-right type-mono-small text-text-subtle tabular-nums"
				>
					{lines.map((_, i) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: a line number is its index
						<div key={i}>{i + 1}</div>
					))}
				</div>
				<pre
					data-testid={`${testId}-text`}
					className="min-w-0 flex-1 py-3 pr-4 pl-3 type-mono-small whitespace-pre text-text-muted"
				>
					{lineTone
						? // Each line its own span, the newlines kept as text between them,
							// so the copied text is exactly `text`.
							lines.map((line, i) => (
								// biome-ignore lint/suspicious/noArrayIndexKey: a line is its index
								<Fragment key={i}>
									<span
										data-tone={lineTone(line, i)}
										className={TONE[lineTone(line, i) ?? "plain"]}
									>
										{line}
									</span>
									{i < lines.length - 1 ? "\n" : null}
								</Fragment>
							))
						: text}
				</pre>
			</div>
			{footer ? (
				<figcaption
					data-testid={`${testId}-footer`}
					className="border-t border-border px-3 py-1.5 type-mono-small text-text-subtle tabular-nums"
				>
					{footer}
				</figcaption>
			) : null}
		</figure>
	);
}
