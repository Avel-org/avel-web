import { useEffect, useRef, useState } from "react";
import { CLIENT_SEARCH_MAX } from "@/lib/api/clients";
import { SearchField } from "./search-field";

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
		<SearchField
			data-testid="clients-search"
			label="Search clients"
			placeholder="Search by name or contact"
			shortcut="/"
			maxLength={CLIENT_SEARCH_MAX}
			value={text}
			onChange={setText}
			className="max-w-sm"
		/>
	);
}
