import { useEffect, useState } from "react";

/** True on Apple platforms, where the command key replaces Ctrl. */
function isApple() {
	return /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
}

/**
 * "⌘K" on Apple platforms, "Ctrl K" elsewhere, for any letter. The server
 * cannot know the platform, so it renders "⌘K" and the client corrects it
 * after mount.
 */
export function useShortcutLabel(key = "K") {
	const letter = key.toUpperCase();
	const [label, setLabel] = useState(`⌘${letter}`);
	useEffect(() => {
		setLabel(isApple() ? `⌘${letter}` : `Ctrl ${letter}`);
	}, [letter]);
	return label;
}

/** True when ⌘ or Ctrl plus `key` was pressed, and nothing else modified it. */
export function isShortcut(
	event: Pick<
		KeyboardEvent,
		"key" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey"
	>,
	key: string,
): boolean {
	return (
		event.key.toLowerCase() === key.toLowerCase() &&
		(event.metaKey || event.ctrlKey) &&
		!event.altKey &&
		!event.shiftKey
	);
}

/** Calls `onPress` on ⌘ or Ctrl plus `key`, anywhere in the app. */
export function useKeyShortcut(key: string, onPress: () => void) {
	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (!isShortcut(event, key)) return;
			// In rich text, ⌘B means bold. Leave it there.
			if (event.target instanceof HTMLElement && event.target.isContentEditable)
				return;
			event.preventDefault();
			onPress();
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [key, onPress]);
}

/** ⌘K or Ctrl K opens the command palette. */
export function useCommandShortcut(onOpen: () => void) {
	useKeyShortcut("k", onOpen);
}
