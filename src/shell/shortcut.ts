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

/** How long the second key of a sequence such as G F may wait for. */
const SEQUENCE_MS = 1000;

/**
 * True when a key pressed at `target` is text, not a shortcut: a field, a
 * contenteditable, or a dialog. A dialog that marks itself
 * `data-allow-shortcuts` (the mission details sheet, which G F exists for)
 * still takes them, unless the key is in a field inside it.
 */
export function isTypingTarget(target: EventTarget | null): boolean {
	// Read by shape, not instanceof, so it is testable without a DOM.
	const el = target as Partial<
		Pick<HTMLElement, "isContentEditable" | "closest">
	> | null;
	if (!el || typeof el.closest !== "function") return false;
	if (el.isContentEditable) return true;
	if (el.closest("input, textarea, select") !== null) return true;
	const dialog = el.closest("[role=dialog]");
	return dialog !== null && !dialog.hasAttribute("data-allow-shortcuts");
}

/**
 * Calls `onPress` on two plain keys pressed in turn, such as G then F, unless
 * the operator is typing: a field, a contenteditable or a modifier held means
 * the keys are text. Absent `onPress` turns it off.
 */
export function useSequenceShortcut(
	first: string,
	second: string,
	onPress: (() => void) | undefined,
) {
	useEffect(() => {
		if (!onPress) return;
		let armedAt = 0;
		const onKeyDown = (event: KeyboardEvent) => {
			if (
				isTypingTarget(event.target) ||
				event.metaKey ||
				event.ctrlKey ||
				event.altKey ||
				event.repeat
			) {
				armedAt = 0;
				return;
			}
			const key = event.key.toLowerCase();
			if (
				key === second &&
				armedAt > 0 &&
				event.timeStamp - armedAt < SEQUENCE_MS
			) {
				armedAt = 0;
				event.preventDefault();
				onPress();
			} else armedAt = key === first ? event.timeStamp : 0;
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [first, second, onPress]);
}

/** ⌘K or Ctrl K opens the command palette. */
export function useCommandShortcut(onOpen: () => void) {
	useKeyShortcut("k", onOpen);
}
