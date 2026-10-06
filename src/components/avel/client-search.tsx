import { Search } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { CLIENT_SEARCH_MAX } from "@/lib/api/clients";

/** The search writes to the URL this long after the last keystroke. */
export const CLIENT_SEARCH_DEBOUNCE_MS = 300;

/**
 * Searches the client list by name or primary contact. The URL's `?q` is the
 * source of truth, so a search is a link; typing updates it after a short
 * pause rather than on every keystroke.
 */
export function ClientSearch({
	value,
	onChange,
}: {
	/** The search in the URL. */
	value: string;
	onChange: (value: string) => void;
}) {
	const id = useId();
	const [text, setText] = useState(value);
	const latest = useRef(onChange);
	latest.current = onChange;

	// Follows the URL when it changes from outside, such as Clear search.
	useEffect(() => setText(value), [value]);

	useEffect(() => {
		if (text === value) return;
		const timer = window.setTimeout(
			() => latest.current(text),
			CLIENT_SEARCH_DEBOUNCE_MS,
		);
		return () => window.clearTimeout(timer);
	}, [text, value]);

	return (
		<div className="relative max-w-sm">
			<label htmlFor={id} className="sr-only">
				Search clients
			</label>
			<Search
				aria-hidden="true"
				className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-text-subtle"
			/>
			<Input
				id={id}
				type="search"
				data-testid="clients-search"
				placeholder="Search by name or contact"
				maxLength={CLIENT_SEARCH_MAX}
				value={text}
				onChange={(event) => setText(event.target.value)}
				className="pl-8"
			/>
		</div>
	);
}
