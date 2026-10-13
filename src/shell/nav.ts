/**
 * The sidebar: thirteen links in three groups, as specified in
 * design/AVEL-DESIGN.md (section 6, ruling 3; ruling 33 adds Drive; Templates
 * joins Library beside Playbooks, the templates they are keyed by). Agents and Settings are
 * parents that group links without being pages themselves; no /catalog or
 * /settings route exists. tests/nav.test.ts fails if any link here has no
 * route, or any route is missing from here.
 */
import {
	Activity,
	Bot,
	BotMessageSquare,
	Building2,
	FolderGit2,
	HardDrive,
	Layers,
	LayoutTemplate,
	Library,
	ListChecks,
	type LucideIcon,
	Plug,
	Settings,
	Target,
	UserRound,
	Wrench,
} from "lucide-react";

export type NavLink = {
	label: string;
	to: string;
	purpose: string;
	icon: LucideIcon;
};
/** Groups links under a label. A button that opens and closes, never a link. */
export type NavParent = {
	label: string;
	icon: LucideIcon;
	children: NavLink[];
};
export type NavItem = NavLink | NavParent;
export type NavGroup = { label: string; items: NavItem[] };

export function isParent(item: NavItem): item is NavParent {
	return "children" in item;
}

export const NAV: NavGroup[] = [
	{
		label: "Work",
		items: [
			{
				// Home is where the owner talks to Canon, the agent who runs the
				// Command Center.
				label: "Home",
				to: "/",
				icon: BotMessageSquare,
				purpose:
					"Ask Canon about your missions, plan the next one, and see what needs you.",
			},
			{
				label: "Missions",
				to: "/missions",
				icon: Target,
				purpose: "Every mission, its modules, and where each one stands.",
			},
			{
				label: "Clients",
				to: "/clients",
				icon: Building2,
				purpose: "Clients and their engagements.",
			},
		],
	},
	{
		label: "Library",
		items: [
			{
				label: "Agents",
				icon: Library,
				children: [
					{
						label: "All agents",
						to: "/catalog/agents",
						icon: Bot,
						purpose:
							"Agents and their generated identities. Read-only; every version is kept.",
					},
					{
						label: "Skills",
						to: "/catalog/skills",
						icon: Wrench,
						purpose:
							"What agents know and the tools they may use. Only reviewed skills can be attached.",
					},
				],
			},
			{
				label: "Teams",
				to: "/presets",
				icon: Layers,
				purpose: "Saved squads of agents that you can apply to a mission.",
			},
			{
				label: "Playbooks",
				to: "/playbooks",
				icon: ListChecks,
				purpose: "The phases and gates each kind of mission follows.",
			},
			{
				label: "Templates",
				to: "/templates",
				icon: LayoutTemplate,
				purpose:
					"AVEL project templates: the repositories a mission is built from.",
			},
			{
				label: "Drive",
				to: "/drive",
				icon: HardDrive,
				purpose:
					"The agency's documents. Agents read a file only when a brief lists it.",
			},
		],
	},
	{
		label: "Control",
		items: [
			{
				label: "Activity",
				to: "/activity",
				icon: Activity,
				purpose: "Everything that happened, in order. Append-only.",
			},
			{
				label: "Settings",
				icon: Settings,
				children: [
					{
						label: "Repositories",
						to: "/settings/repositories",
						icon: FolderGit2,
						purpose: "Which repositories AVEL may deliver to, and how.",
					},
					{
						label: "Connections",
						to: "/settings/connections",
						icon: Plug,
						purpose: "The accounts AVEL connects to.",
					},
					{
						label: "Account",
						to: "/settings/account",
						icon: UserRound,
						purpose: "Your sign-in and preferences.",
					},
				],
			},
		],
	},
];

/** The thirteen leaf links, in sidebar order. Parents are not links. */
export const ALL_LINKS: NavLink[] = NAV.flatMap((group) =>
	group.items.flatMap((item) => (isParent(item) ? item.children : [item])),
);

/** True when `pathname` is this link's page or a page nested under it. */
export function isWithin(pathname: string, to: string): boolean {
	return pathname === to || pathname.startsWith(`${to}/`);
}

/**
 * The parent holding the link for `pathname`, so the sidebar can open it when
 * one of its children is the current page.
 */
export function parentFor(pathname: string): NavParent | undefined {
	return NAV.flatMap((group) => group.items)
		.filter(isParent)
		.find((parent) =>
			parent.children.some((link) => isWithin(pathname, link.to)),
		);
}

/**
 * Routes deliberately absent from the sidebar. Development tools only: each
 * must live under /dev/ and 404 outside `pnpm dev`. tests/nav.test.ts holds
 * this list to both rules.
 */
export const UNLINKED_ROUTES: string[] = ["/dev/primitives"];

export function linkFor(to: string): NavLink {
	const link = ALL_LINKS.find((l) => l.to === to);
	if (!link) throw new Error(`No sidebar link for ${to}`);
	return link;
}
