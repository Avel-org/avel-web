import { useLocation, useNavigate } from "@tanstack/react-router";
import type { Client, MissionListItem } from "avel-server/contract";
import {
	Clock,
	Link as LinkIcon,
	LogOut,
	Maximize2,
	Moon,
	PanelLeftClose,
	PanelLeftOpen,
	Plus,
	Sun,
	Target,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Kbd } from "@/components/ui/badge";
import {
	CommandDialog,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
	CommandShortcut,
} from "@/components/ui/command";
import { useSignOut } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import { type RecentEntry, useRecent } from "./command-recent";
import {
	ClientResults,
	MissionResults,
	missionLabel,
	SEARCH_DEBOUNCE_MS,
	useDebounced,
} from "./command-search";
import { ALL_LINKS, isParent, NAV, type NavLink } from "./nav";
import { useShortcutLabel } from "./shortcut";

/** The sidebar's rail, from the shell, for the collapse action. */
export type SidebarControl = { collapsed: boolean; toggle: () => void };

/**
 * ⌘K: the command menu. Search results first, then every page, the things
 * that can be created, actions on the app, and what was opened here
 * recently. Selecting anything closes the menu and does it.
 */
export function CommandPalette({
	open,
	onOpenChange,
	sidebar,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	sidebar?: SidebarControl;
}) {
	const navigate = useNavigate();
	const { theme, setTheme } = useTheme();
	const signOut = useSignOut();
	const [recent, addRecent] = useRecent();
	const [search, setSearch] = useState("");
	const panelMission = usePanelMission();

	const close = () => {
		onOpenChange(false);
		setSearch("");
	};

	const openEntry = (entry: RecentEntry) => {
		close();
		addRecent(entry);
		// A mission opens its full page (audit F6): the panel is for
		// scanning a list, the page for acting on one mission.
		if (entry.kind === "page") navigate({ to: entry.to });
		else navigate({ to: "/missions/$id", params: { id: entry.id } });
	};

	const handlers: CommandHandlers = {
		openPage: (to, label) => openEntry({ kind: "page", to, label }),
		openMission: (mission) =>
			openEntry({
				kind: "mission",
				id: mission.id,
				origin: mission.origin,
				label: missionLabel(mission),
			}),
		openRecent: openEntry,
		openClient: (client) => {
			close();
			navigate({ to: "/clients/$id", params: { id: client.id } });
		},
		newClient: () => {
			close();
			navigate({ to: "/clients", search: { new: true } });
		},
		newMission: () => {
			close();
			navigate({ to: "/missions", search: { new: true } });
		},
		switchTheme: () => {
			close();
			setTheme(theme === "dark" ? "light" : "dark");
		},
		toggleSidebar: sidebar
			? () => {
					close();
					sidebar.toggle();
				}
			: undefined,
		copyLink: () => {
			close();
			navigator.clipboard
				.writeText(window.location.href)
				.then(() => toast.success("Link copied."))
				.catch(() => toast.error("Could not copy the link."));
		},
		signOut: () => {
			close();
			void signOut();
		},
		openFullPage: panelMission
			? () => {
					close();
					navigate({ to: "/missions/$id", params: { id: panelMission } });
				}
			: undefined,
	};

	return (
		<CommandDialog
			open={open}
			onOpenChange={(next) => (next ? onOpenChange(true) : close())}
			title="Command menu"
			description="Search, go to a page, create something, or run an action."
		>
			<CommandMenu
				search={search}
				onSearchChange={setSearch}
				theme={theme}
				sidebarCollapsed={sidebar?.collapsed}
				recent={recent}
				handlers={handlers}
			/>
		</CommandDialog>
	);
}

/**
 * The mission whose side panel is open on /missions, if any. The panel is
 * for scanning; its full page is for acting (audit F6), and the command menu
 * and G F open it.
 */
export function usePanelMission(): string | undefined {
	return useLocation({
		select: (location) =>
			location.pathname === "/missions"
				? (location.search as { mission?: string }).mission
				: undefined,
	});
}

/**
 * Every page, with the words it can be found by: its group's label and, for a
 * nested page, its parent's, so "settings" finds Repositories, Connections and
 * Account.
 */
export function goToEntries(): { link: NavLink; words: string }[] {
	return NAV.flatMap((group) =>
		group.items.flatMap((item) =>
			isParent(item)
				? item.children.map((link) => ({
						link,
						words: `${group.label} ${item.label}`,
					}))
				: [{ link: item, words: group.label }],
		),
	);
}

export type CommandHandlers = {
	openPage: (to: string, label: string) => void;
	openMission: (mission: MissionListItem) => void;
	/** Opens the client's page. The search it matched is passed for callers that keep it. */
	openClient: (client: Client, search: string) => void;
	openRecent: (entry: RecentEntry) => void;
	newClient: () => void;
	/** Opens New mission on Missions: the intake a mission starts from. */
	newMission: () => void;
	switchTheme: () => void;
	/** Absent when the shell gives no sidebar control. */
	toggleSidebar?: () => void;
	copyLink: () => void;
	signOut: () => void;
	/** Present while a mission's side panel is open: opens its full page. */
	openFullPage?: () => void;
};

/**
 * The menu's contents, inside the dialog's Command. Presentational apart from
 * the search results, which fetch; tests render it inside a bare Command.
 */
export function CommandMenu({
	search,
	onSearchChange,
	theme,
	sidebarCollapsed,
	recent,
	handlers,
}: {
	search: string;
	onSearchChange: (value: string) => void;
	theme: "dark" | "light";
	sidebarCollapsed?: boolean;
	recent: readonly RecentEntry[];
	handlers: CommandHandlers;
}) {
	const query = useDebounced(search.trim(), SEARCH_DEBOUNCE_MS);
	const nextTheme = theme === "dark" ? "light" : "dark";
	const collapseShortcut = useShortcutLabel("b");

	return (
		<>
			<CommandInput
				value={search}
				onValueChange={onSearchChange}
				placeholder="Search missions, or type a page or action"
				data-testid="command-input"
			/>
			<CommandList data-testid="command-palette">
				<CommandEmpty>Nothing matches.</CommandEmpty>

				<MissionResults query={query} onOpen={handlers.openMission} />
				<ClientResults
					query={query}
					onOpen={(client) => handlers.openClient(client, query)}
				/>

				<CommandGroup heading="Go to" data-testid="command-group-go">
					{goToEntries().map(({ link, words }) => (
						<CommandItem
							key={link.to}
							// The group and parent labels are searchable too, so
							// "settings" finds Repositories, Connections and Account.
							value={`${link.label} ${words} ${link.purpose}`}
							onSelect={() => handlers.openPage(link.to, link.label)}
							data-testid={`command-${link.to.slice(1).replaceAll("/", "-") || "home"}`}
						>
							<link.icon aria-hidden="true" />
							{link.label}
						</CommandItem>
					))}
				</CommandGroup>

				<CommandGroup heading="Create" data-testid="command-group-create">
					<CommandItem
						value="New client"
						data-testid="command-new-client"
						onSelect={handlers.newClient}
					>
						<Plus aria-hidden="true" />
						New client
					</CommandItem>
					<CommandItem
						value="New mission"
						data-testid="command-new-mission"
						onSelect={handlers.newMission}
					>
						<Plus aria-hidden="true" />
						New mission
					</CommandItem>
				</CommandGroup>

				<CommandGroup heading="Actions" data-testid="command-group-actions">
					{handlers.openFullPage ? (
						<CommandItem
							value="Open full page"
							data-testid="command-open-full-page"
							onSelect={handlers.openFullPage}
						>
							<Maximize2 aria-hidden="true" />
							Open full page
							<CommandShortcut className="type-mono">G F</CommandShortcut>
						</CommandItem>
					) : null}
					<CommandItem
						value={`Switch to ${nextTheme} theme`}
						data-testid="command-theme"
						onSelect={handlers.switchTheme}
					>
						{theme === "dark" ? (
							<Sun aria-hidden="true" />
						) : (
							<Moon aria-hidden="true" />
						)}
						{`Switch to ${nextTheme} theme`}
					</CommandItem>
					{handlers.toggleSidebar ? (
						<CommandItem
							value={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
							data-testid="command-sidebar"
							onSelect={handlers.toggleSidebar}
						>
							{sidebarCollapsed ? (
								<PanelLeftOpen aria-hidden="true" />
							) : (
								<PanelLeftClose aria-hidden="true" />
							)}
							{sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
							<CommandShortcut className="type-mono">
								{collapseShortcut}
							</CommandShortcut>
						</CommandItem>
					) : null}
					<CommandItem
						value="Copy link to this page"
						data-testid="command-copy-link"
						onSelect={handlers.copyLink}
					>
						<LinkIcon aria-hidden="true" />
						Copy link to this page
					</CommandItem>
					<CommandItem
						value="Sign out"
						data-testid="command-sign-out"
						onSelect={handlers.signOut}
					>
						<LogOut aria-hidden="true" />
						Sign out
					</CommandItem>
				</CommandGroup>

				{recent.length > 0 ? (
					<CommandGroup heading="Recent" data-testid="command-group-recent">
						{recent.map((entry) => (
							<RecentItem
								key={entry.kind === "page" ? entry.to : entry.id}
								entry={entry}
								onSelect={() => handlers.openRecent(entry)}
							/>
						))}
					</CommandGroup>
				) : null}
			</CommandList>
			<CommandFooter />
		</>
	);
}

function RecentItem({
	entry,
	onSelect,
}: {
	entry: RecentEntry;
	onSelect: () => void;
}) {
	const link =
		entry.kind === "page" ? ALL_LINKS.find((l) => l.to === entry.to) : null;
	const Icon = entry.kind === "mission" ? Target : (link?.icon ?? Clock);
	return (
		<CommandItem
			// "recent" keeps a recent page distinct from its Go to item.
			value={`recent ${entry.kind} ${entry.label}`}
			data-testid={`command-recent-${entry.kind === "page" ? entry.to.slice(1).replaceAll("/", "-") || "home" : entry.id}`}
			onSelect={onSelect}
		>
			<Icon aria-hidden="true" />
			{entry.label}
		</CommandItem>
	);
}

/** How to drive the menu from the keyboard. */
function CommandFooter() {
	const hints: [string, string, string][] = [
		["move", "↑↓", "Up and down arrows"],
		["open", "↵", "Enter"],
		["close", "esc", "Escape"],
	];
	return (
		<div
			data-testid="command-footer"
			className="flex items-center gap-4 border-t border-border px-3 py-2 type-caption text-text-subtle"
		>
			{hints.map(([action, key, name]) => (
				<span key={action} className="flex items-center gap-1.5">
					<Kbd aria-label={name}>{key}</Kbd>
					{`to ${action}`}
				</span>
			))}
		</div>
	);
}
