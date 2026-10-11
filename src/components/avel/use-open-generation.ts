import { useState } from "react";

/**
 * A number that goes up each time `open` turns true. Keying a modal's form
 * on it starts every opening from fresh values, while the modal itself stays
 * mounted so its closing animation still runs.
 */
export function useOpenGeneration(open: boolean): number {
	const [generation, setGeneration] = useState(open ? 1 : 0);
	const [wasOpen, setWasOpen] = useState(open);
	// Adjusting state while rendering, React's pattern for state derived from
	// a prop change: no effect, so the fresh form is in the first open frame.
	if (open !== wasOpen) {
		setWasOpen(open);
		if (open) setGeneration(generation + 1);
	}
	return generation;
}
