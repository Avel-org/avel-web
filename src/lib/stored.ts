import { useCallback, useEffect, useState } from "react";

/**
 * A per-viewer preference kept in localStorage, such as the theme or a
 * collapsed sidebar. Storage can be missing or throw (private windows, blocked
 * site data), so every access is guarded and the default always works. Never
 * use this for state that must persist reliably or be shared.
 *
 * The server renders the default; the stored value applies after mount.
 */
export function useStoredState<T extends string>(
	key: string,
	fallback: T,
	allowed: readonly T[],
): [T, (value: T) => void] {
	const [value, setValue] = useState<T>(fallback);

	useEffect(() => {
		try {
			const stored = window.localStorage.getItem(key);
			if (stored !== null && (allowed as readonly string[]).includes(stored)) {
				setValue(stored as T);
			}
		} catch {
			// Storage unavailable: keep the default.
		}
	}, [key, allowed]);

	const set = useCallback(
		(next: T) => {
			setValue(next);
			try {
				window.localStorage.setItem(key, next);
			} catch {
				// Storage unavailable: the choice lasts for this page only.
			}
		},
		[key],
	);

	return [value, set];
}
