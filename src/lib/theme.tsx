import { createContext, type ReactNode, useContext, useState } from "react";
import { useStoredState } from "@/lib/stored";
import { cn } from "@/lib/utils";

/**
 * The theme lives on the app wrapper as `.light`, never on <html>
 * (DAY-ONE-FRONTEND.md, SHADCN-PRINCIPLES.md section 6). Radix portals render
 * to <body> by default, which is outside that wrapper, so a light-mode dialog
 * would render dark. ThemeRoot therefore owns a portal container inside the
 * themed subtree, and every primitive that portals renders into it.
 */
export type Theme = "dark" | "light";
const THEMES: readonly Theme[] = ["dark", "light"];

const ThemeContext = createContext<{
	theme: Theme;
	setTheme: (theme: Theme) => void;
} | null>(null);

const PortalContainerContext = createContext<HTMLElement | null>(null);

export function ThemeRoot({ children }: { children: ReactNode }) {
	const [theme, setTheme] = useStoredState<Theme>("avel.theme", "dark", THEMES);
	const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(
		null,
	);

	return (
		<ThemeContext.Provider value={{ theme, setTheme }}>
			<PortalContainerContext.Provider value={portalContainer}>
				<div
					data-theme={theme}
					className={cn("app", theme === "light" && "light")}
				>
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
