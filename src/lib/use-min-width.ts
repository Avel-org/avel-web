import { useEffect, useState } from "react";

/**
 * Whether the window is at least this wide (a CSS length, "80rem" for xl),
 * undefined until the browser answers. Server rendering and the first client
 * render both see undefined, so a caller can render for neither width yet.
 */
export function useMinWidth(width: string): boolean | undefined {
	const [matches, setMatches] = useState<boolean | undefined>(undefined);
	useEffect(() => {
		const query = window.matchMedia(`(min-width: ${width})`);
		const update = () => setMatches(query.matches);
		update();
		query.addEventListener("change", update);
		return () => query.removeEventListener("change", update);
	}, [width]);
	return matches;
}
