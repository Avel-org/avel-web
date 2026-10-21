import { createContext, type ReactNode, useContext, useState } from "react";
import { useStoredState } from "@/lib/stored";
import { cn } from "@/lib/utils";

/**
 * The theme lives on the app wrapper as `.dark`, never on <html>
 * (DAY-ONE-FRONTEND.md, SHADCN-PRINCIPLES.md section 6). Radix portals render
 * to <body> by default, which is outside that wrapper, so a dark-mode dialog
 * would render light. ThemeRoot therefore owns a portal container inside the
 * themed subtree, and every primitive that portals renders into it.
 */
/** Light is the default (design system v3 is light-first). */
export type Theme = "light" | "dark";
const THEMES: readonly Theme[] = ["light", "dark"];

const ThemeContext = createContext<{
	theme: Theme;
	setTheme: (theme: Theme) => void;
} | null>(null);

const PortalContainerContext = createContext<HTMLElement | null>(null);

/**
 * Runs inline, before the first paint. The stored theme otherwise applies
 * only after hydration (useStoredState), so a dark viewer saw the light
 * shell, the checking screen included, until then. It marks the wrapper
 * it sits in; React leaves the class alone while hydrating
 * (suppressHydrationWarning) and sets the same one once the stored value
 * loads.
 */
export const BOOT_THEME_SCRIPT = `try{if(localStorage.getItem("avel.theme")==="dark"){var a=document.currentScript.parentElement;a.classList.add("dark");a.setAttribute("data-theme","dark")}}catch(e){}`;

export function ThemeRoot({ children }: { children: ReactNode }) {
	const [theme, setTheme] = useStoredState<Theme>(
		"avel.theme",
		"light",
		THEMES,
	);
	const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(
		null,
	);

	return (
		<ThemeContext.Provider value={{ theme, setTheme }}>
			<PortalContainerContext.Provider value={portalContainer}>
				<div
					data-theme={theme}
					className={cn("app", theme === "dark" && "dark")}
					suppressHydrationWarning
				>
					<script
						// biome-ignore lint/security/noDangerouslySetInnerHtml: a fixed string, written here, that must run before paint.
						dangerouslySetInnerHTML={{ __html: BOOT_THEME_SCRIPT }}
					/>
					{children}
					<div data-slot="portal-root" ref={setPortalContainer} />
				</div>
			</PortalContainerContext.Provider>
		</ThemeContext.Provider>
	);
}

export function useTheme() {
	const context = useContext(ThemeContext);
	if (!context) throw new Error("useTheme must be used inside <ThemeRoot>");
	return context;
}

/** Where a primitive's portal renders. Undefined falls back to <body>. */
export function usePortalContainer(): HTMLElement | undefined {
	return useContext(PortalContainerContext) ?? undefined;
}
