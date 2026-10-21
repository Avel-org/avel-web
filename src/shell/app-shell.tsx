import { useLocation, useNavigate } from "@tanstack/react-router";
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useMemo,
	useState,
} from "react";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetTitle,
} from "@/components/ui/sheet";
import { useStoredState } from "@/lib/stored";
import { cn } from "@/lib/utils";
import { AuthGate } from "./auth-gate";
import { CommandPalette, usePanelMission } from "./command-palette";
import { DeviceBoundary } from "./device-boundary";
import {
	useCommandShortcut,
	useKeyShortcut,
	useSequenceShortcut,
	useShortcutLabel,
} from "./shortcut";
import { SidebarBody } from "./sidebar";

const RAIL = ["open", "collapsed"] as const;

export type CommandPaletteControl = {
	/** Opens ⌘K. Closes the navigation drawer first if it is open. */
	open: () => void;
	/** "⌘K" on Apple platforms, "Ctrl K" elsewhere, for a hint beside a trigger. */
	shortcut: string;
};

export type NavigationDrawerControl = {
	/** Opens the navigation drawer. Below md only: at md and up it is never shown. */
	open: () => void;
};

const CommandPaletteContext = createContext<CommandPaletteControl | null>(null);
const NavigationDrawerContext = createContext<NavigationDrawerControl | null>(
	null,
);

/**
 * The command palette's controls, for any trigger inside the shell, such as
 * the search icon in the global header. ⌘K and Ctrl K work without it.
 */
export function useCommandPalette(): CommandPaletteControl {
	const control = useContext(CommandPaletteContext);
	if (!control) {
		throw new Error("useCommandPalette must be used inside <AppShell>");
	}
	return control;
}

/**
 * Opens the navigation drawer, for the menu button at the start of the page's
 * top bar on a phone. The shell has no bar of its own below md.
 */
export function useNavigationDrawer(): NavigationDrawerControl {
	const control = useContext(NavigationDrawerContext);
	if (!control) {
		throw new Error("useNavigationDrawer must be used inside <AppShell>");
	}
	return control;
}

/**
 * The app shell (AVEL-DESIGN.md section 6, ruling 17). The sidebar sits on
 * bg; the content is a rounded canvas on the panel surface, inset from the
 * viewport's top, right and bottom. The gap between them is the seam, so the
 * sidebar has no border.
 *
 * The shell is exactly the viewport and never scrolls. The canvas is the one
 * scroller for pages, so a page's sticky top bar sticks to the canvas, and
 * the sidebar scrolls on its own. Below md the canvas runs edge to edge and
 * the sidebar becomes a drawer, opened from the page's top bar.
 */
export function AppShell({ children }: { children: ReactNode }) {
	// Nothing of the shell renders until the gate has a signed-in operator.
	return (
		<AuthGate
			bare={
				<main id="main" data-testid="dev-bare" className="min-h-dvh bg-app-bg">
					{children}
				</main>
			}
		>
			<Shell>{children}</Shell>
		</AuthGate>
	);
}

function Shell({ children }: { children: ReactNode }) {
	const [rail, setRail] = useStoredState("avel.sidebar", "open", RAIL);
	const [drawerOpen, setDrawerOpen] = useState(false);
	const [paletteOpen, setPaletteOpen] = useState(false);
	const collapsed = rail === "collapsed";
	const pathname = useLocation({ select: (location) => location.pathname });

	const openPalette = useCallback(() => {
		setDrawerOpen(false);
		setPaletteOpen(true);
	}, []);
	useCommandShortcut(openPalette);
	const shortcut = useShortcutLabel("k");
	const palette = useMemo(
		() => ({ open: openPalette, shortcut }),
		[openPalette, shortcut],
	);

	const toggleRail = useCallback(
		() => setRail(collapsed ? "open" : "collapsed"),
		[collapsed, setRail],
	);
	useKeyShortcut("b", toggleRail);

	// G F: a mission's side panel to its full page (audit F6).
	const navigate = useNavigate();
	const panelMission = usePanelMission();
	const openFullPage = useMemo(
		() =>
			panelMission
				? () => navigate({ to: "/missions/$id", params: { id: panelMission } })
				: undefined,
		[navigate, panelMission],
	);
	useSequenceShortcut("g", "f", openFullPage);

	const drawer = useMemo(() => ({ open: () => setDrawerOpen(true) }), []);

	return (
		<CommandPaletteContext.Provider value={palette}>
			<NavigationDrawerContext.Provider value={drawer}>
				<div
					data-testid="app-shell"
					// Safe-area padding keeps the shell clear of notches and home
					// indicators in the Tauri mobile build. Zero on a desktop.
					className="flex h-dvh overflow-hidden bg-app-bg pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)]"
				>
					<a
						href="#main"
						data-testid="skip-link"
						className="fixed top-3 left-3 z-(--z-toast) -translate-y-20 rounded-control bg-popover px-3 py-2 type-body shadow-popover focus:translate-y-0"
					>
						Skip to content
					</a>

					<aside
						data-testid="sidebar"
						data-collapsed={collapsed || undefined}
						className={cn(
							// Collapsing: labels fade first (micro), then the width
							// moves (state). Expanding runs the other way round, so
							// nothing is seen re-laying out.
							"z-(--z-dock) h-full shrink-0 overflow-hidden transition-[width] duration-(--duration-state) ease-avel max-md:hidden",
							collapsed ? "w-14 delay-(--duration-micro)" : "w-62",
						)}
					>
						<SidebarBody collapsed={collapsed} onToggleCollapsed={toggleRail} />
					</aside>

					<div
						data-testid="canvas"
						// The rounded clip: a v3 panel on the frame, at the dialog
						// radius. The scroller sits inside it, so the scrollbar and
						// the sticky top bar never cut the corners.
						className="flex min-w-0 flex-1 flex-col overflow-hidden bg-app-page md:m-(--canvas-inset) md:rounded-dialog md:border md:border-border md:shadow-card"
					>
						<main
							id="main"
							tabIndex={-1}
							data-testid="canvas-scroll"
							// Relative: the containing block for every absolute box in a
							// page, sr-only labels included. Without it they were placed
							// against the root, stretched the document past the
							// viewport, and the whole shell could scroll.
							className="app-scroll relative flex min-h-0 flex-1 flex-col overflow-y-auto outline-none"
						>
							{/* Keyed by path: each page mounts fresh, with no
							    entrance animation (v3 has no motion at rest). */}
							<div
								key={pathname}
								data-testid="page-enter"
								className="flex flex-1 flex-col"
							>
								<DeviceBoundary>{children}</DeviceBoundary>
							</div>
						</main>
					</div>
				</div>

				<Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
					<SheetContent
						side="left"
						showCloseButton={false}
						className="w-62 gap-0 bg-app-bg p-0 sm:max-w-62"
						data-testid="drawer"
					>
						<SheetTitle className="sr-only">Navigation</SheetTitle>
						<SheetDescription className="sr-only">
							Pages of the Command Center.
						</SheetDescription>
						<SidebarBody
							collapsed={false}
							onNavigate={() => setDrawerOpen(false)}
						/>
					</SheetContent>
				</Sheet>

				<CommandPalette
					open={paletteOpen}
					onOpenChange={setPaletteOpen}
					sidebar={{ collapsed, toggle: toggleRail }}
				/>
			</NavigationDrawerContext.Provider>
		</CommandPaletteContext.Provider>
	);
}
