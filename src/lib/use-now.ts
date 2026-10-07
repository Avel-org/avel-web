import { useEffect, useState } from "react";

/**
 * The time relative times are measured from, moved on each minute. A page
 * whose list refetches (on focus, on Load more) must not keep the time it
 * mounted at, or a newer row reads as in the future and older rows never age.
 */
export function useNow(): number {
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		const timer = window.setInterval(() => setNow(Date.now()), 60_000);
		return () => window.clearInterval(timer);
	}, []);
	return now;
}
