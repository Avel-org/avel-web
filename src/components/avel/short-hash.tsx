import { Check, Copy } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { useCopy } from "@/lib/clipboard";
import { cn } from "@/lib/utils";

/*
 * No long generated id is ever visible text. A hash shows its first seven
 * characters; an id shows a word for what it names. Either way the full
 * value stays reachable, for support: on hover, to screen readers, and
 * behind Copy.
 */

/** How many characters of a hash are shown, as git shows a commit. */
export const SHORT_HASH_LENGTH = 7;

/** "9f86d08", a hash's first seven characters. */
export function shortHash(value: string): string {
	return value.slice(0, SHORT_HASH_LENGTH);
}

/** Copy for a full value, with a polite live region saying how it went. */
function CopyValue({
	value,
	label,
	"data-testid": testId,
}: {
	value: string;
	label: string;
	"data-testid"?: string;
}) {
	const { status, copy } = useCopy();
	return (
		<>
			<Button
				variant="ghost"
				size="icon-xs"
				aria-label={`Copy ${label}`}
				data-testid={testId ? `${testId}-copy` : undefined}
				// Rows and cards that hold a hash are often clickable themselves.
				onClick={(event) => {
					event.stopPropagation();
					event.preventDefault();
					void copy(value);
				}}
			>
				{status === "Copied" ? (
					<Check aria-hidden="true" />
				) : (
					<Copy aria-hidden="true" />
				)}
			</Button>
			{/* Says whether the copy worked: the clipboard can refuse. */}
			<span
				aria-live="polite"
				data-testid={testId ? `${testId}-copy-status` : undefined}
				className="sr-only"
			>
				{status}
			</span>
		</>
	);
}

/**
 * A hash: seven characters in mono, the full value on hover and to screen
 * readers, and Copy, which copies the full value (AVEL-DESIGN.md section 12).
 */
export function ShortHash({
	value,
	label,
	className,
	"data-testid": testId,
}: {
	value: string;
	/** What the hash is of, for the copy button's name: "the SHA-256". */
	label: string;
	className?: string;
	"data-testid"?: string;
}) {
	return (
		<span
			data-testid={testId}
			className={cn("inline-flex items-center gap-1", className)}
		>
			<code
				title={value}
				data-full={value}
				className="type-mono-small text-text-muted"
			>
				{/* Not selectable, so a hand copy takes only the full value. */}
				<span aria-hidden="true" className="select-none tabular-nums">
					{shortHash(value)}
				</span>
				<span className="sr-only">{value}</span>
			</code>
			<CopyValue value={value} label={label} data-testid={testId} />
		</span>
	);
}

/**
 * An id kept out of sight: the words for what it names (children), the id
 * on hover, and Copy. For a thing whose name can't be read (gone from the
 * catalog, deleted), or a reference only support needs.
 */
export function HiddenId({
	id,
	label,
	children,
	"data-testid": testId,
}: {
	id: string;
	/** What the id is of, for the copy button's name: "the agent's id". */
	label: string;
	children: ReactNode;
	"data-testid"?: string;
}) {
	return (
		<span data-testid={testId} className="inline-flex items-center gap-1">
			<span title={id} data-full={id}>
				{children}
			</span>
			<CopyValue value={id} label={label} data-testid={testId} />
		</span>
	);
}
