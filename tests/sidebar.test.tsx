import {
	createMemoryHistory,
	createRootRoute,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SessionSourceProvider } from "@/lib/auth";
import { ThemeRoot } from "@/lib/theme";
import { routeTree } from "@/routeTree.gen";
import { GateView } from "@/shell/auth-gate";
import { initials, OPERATOR_ROLE } from "@/shell/operator";
import { isShortcut } from "@/shell/shortcut";
import { SidebarBody } from "@/shell/sidebar";
import { signedIn, TEST_OPERATOR } from "./auth-session";

// The real app through the real router at a path. The node environment has
// no DOM, so these assert on the server-rendered markup.
async function app(path: string): Promise<string> {
	const router = createRouter({
		routeTree,
		history: createMemoryHistory({ initialEntries: [path] }),
	});
	await router.load();
	return renderToString(
		<SessionSourceProvider source={signedIn()}>
			<RouterProvider router={router} />
		</SessionSourceProvider>,
	);
}

// The sidebar alone, collapsed. The shell renders the stored default (open)
// on the server, so the rail is rendered directly.
async function rail(path: string): Promise<string> {
	const router = createRouter({
		routeTree: createRootRoute({
			component: () => (
				<ThemeRoot>
					<TooltipProvider>
						<GateView
							state={{
								status: "signed-in",
								user: TEST_OPERATOR,
								refused: false,
							}}
							onSignIn={async () => undefined}
							onSignOut={async () => undefined}
						>
							<SidebarBody collapsed onToggleCollapsed={() => undefined} />
						</GateView>
					</TooltipProvider>
				</ThemeRoot>
			),
		}),
		history: createMemoryHistory({ initialEntries: [path] }),
	});
	await router.load();
	return renderToString(<RouterProvider router={router} />);
}

/** The opening tag of the element carrying this data-testid. */
function tag(html: string, testid: string): string {
	const match = html.match(
		new RegExp(`<[a-z]+[^>]*data-testid="${testid}"[^>]*>`),
	);
	if (!match) throw new Error(`no element with data-testid="${testid}"`);
	return match[0];
}

/** Attribute text as written in the source: React escapes ' & < > in markup. */
const decoded = (html: string) =>
	html
		.replaceAll("&#x27;", "'")
		.replaceAll("&lt;", "<")
		.replaceAll("&gt;", ">")
		.replaceAll("&amp;", "&");

/** From an element's opening tag to the next closing tag of its kind. */
function element(html: string, testid: string, close = "</a>"): string {
	const open = tag(html, testid);
	const start = html.indexOf(open);
	return html.slice(start, html.indexOf(close, start) + close.length);
}

/** The sidebar's markup only, so page content cannot satisfy an assertion. */
function sidebar(html: string): string {
	const start = html.indexOf('data-testid="sidebar"');
	return html.slice(start, html.indexOf('data-testid="canvas"', start));
}

const count = (html: string, needle: string) => html.split(needle).length - 1;

describe("the current page", () => {
	it("is marked once, by a glow on the right edge, with no fill", async () => {
		const html = sidebar(await app("/missions"));
		expect(count(html, 'aria-current="page"')).toBe(1);
		expect(count(html, 'data-testid="nav-active-mark"')).toBe(1);
		const row = element(html, "nav-missions");
		expect(row).toContain('aria-current="page"');
		expect(row).toContain('data-testid="nav-active-mark"');
		expect(tag(html, "nav-missions")).not.toMatch(
			/aria-\[current=page\]:bg-(?!transparent)/,
		);
	});

	/** A glow layer's shape and its opacity in each theme. */
	async function glow(testid: string) {
		const layer = tag(sidebar(await app("/missions")), testid);
		const shape = layer.match(/\[--glow-shape:ellipse_(\d+)%_(\d+)%\]/);
		return {
			layer,
			width: Number(shape?.[1]),
			height: Number(shape?.[2]),
			dark: Number(layer.match(/\sopacity-(\d+)\b/)?.[1]),
			light: Number(layer.match(/in-\[\.light\]:opacity-(\d+)\b/)?.[1]),
		};
	}

	it("glows from the right edge only, with no line", async () => {
		const row = element(sidebar(await app("/missions")), "nav-missions");
		for (const testid of ["nav-active-core", "nav-active-wash"]) {
			const { layer } = await glow(testid);
			expect(layer).toContain(
				"radial-gradient(var(--glow-shape)_at_100%_50%,var(--color-accent),transparent)",
			);
		}
		// No hard line: no solid fill and no thin bar anywhere in the row.
		expect(row).not.toMatch(/\sbg-accent[\s"]/);
		expect(row).not.toMatch(/\bw-0\.5\b|\bw-px\b|\bborder-r\b/);
	});

	it("has a core strong enough to see, and a wider, fainter wash", async () => {
		const core = await glow("nav-active-core");
		const wash = await glow("nav-active-wash");
		// Light from the edge: the core about 30% wide and 90% tall.
		expect([core.width, core.height]).toEqual([30, 90]);
		expect(core.dark).toBeGreaterThanOrEqual(45);
		expect(core.dark).toBeLessThanOrEqual(55);
		expect(core.light).toBeGreaterThanOrEqual(55);
		expect(core.light).toBeLessThanOrEqual(65);
		expect(wash.width).toBeGreaterThan(core.width);
		expect(wash.height).toBeGreaterThan(core.height);
		for (const value of [wash.dark, wash.light]) {
			expect(value).toBeGreaterThanOrEqual(25);
			expect(value).toBeLessThanOrEqual(30);
		}
	});

	it("glows stronger in light mode, where the accent reads fainter", async () => {
		const core = await glow("nav-active-core");
		const wash = await glow("nav-active-wash");
		expect(core.light).toBeGreaterThan(core.dark);
		expect(wash.light).toBeGreaterThan(wash.dark);
	});

	it("keeps the current row's accent icon and medium label", async () => {
		const row = decoded(tag(sidebar(await app("/missions")), "nav-missions"));
		expect(row).toContain('aria-current="page"');
		expect(row).toContain("aria-[current=page]:[&>svg]:text-accent-text");
		expect(row).toContain("aria-[current=page]:font-medium");
	});

	it("is the only aria-current on the page: the footer adds no second link", async () => {
		const html = await app("/settings/account");
		expect(count(html, 'aria-current="page"')).toBe(1);
		expect(count(html, 'href="/settings/account"')).toBe(1);
	});
});

describe("parents (ruling 13)", () => {
	it("opens the parent of the current page, and marks the child", async () => {
		const html = sidebar(await app("/catalog/skills"));
		expect(tag(html, "nav-agents")).toMatch(
			/^<button[^>]*aria-expanded="true"/,
		);
		expect(tag(html, "nav-agents-children")).toContain("data-expanded");
		expect(element(html, "nav-skills")).toContain(
			'data-testid="nav-active-mark"',
		);
		// Open, the parent itself does not repeat the mark.
		expect(element(html, "nav-agents", "</button>")).not.toContain(
			"nav-active-mark",
		);
	});

	it("keeps other parents closed and their children out of reach", async () => {
		const html = sidebar(await app("/catalog/skills"));
		expect(tag(html, "nav-settings")).toMatch(/aria-expanded="false"/);
		const open = tag(html, "nav-settings-children");
		expect(open).not.toContain("data-expanded");
		const after = html.slice(html.indexOf(open) + open.length);
		expect(after).toMatch(/^<div[^>]*inert=""/);
	});

	it("is a button that controls its list, never a link", async () => {
		const html = sidebar(await app("/missions"));
		const button = tag(html, "nav-settings");
		expect(button).toMatch(/^<button type="button"/);
		const controls = button.match(/aria-controls="([^"]+)"/)?.[1];
		expect(controls).toBeTruthy();
		expect(html).toContain(`<ul id="${controls}"`);
		expect(html).not.toContain('href="/settings"');
		expect(html).not.toContain('href="/catalog"');
	});

	it("hangs children off a ruler, without icons", async () => {
		const html = sidebar(await app("/catalog/skills"));
		// Ruling 30: a 1px line under the parent's icon, at the strong hairline.
		expect(tag(html, "nav-agents-ruler")).toMatch(
			/class="[^"]*ml-5[^"]*border-l border-border-strong/,
		);
		expect(element(html, "nav-skills")).not.toContain("<svg");
		expect(element(html, "nav-missions")).toContain("<svg");
	});

	it("ticks the ruler at every child, and marks the current one in accent", async () => {
		const ruler = decoded(
			element(
				sidebar(await app("/catalog/skills")),
				"nav-agents-ruler",
				"</ul>",
			),
		);
		const ticks = [
			...ruler.matchAll(/<li data-testid="nav-ruler-tick" class="([^"]+)"/g),
		];
		expect(ticks.length).toBeGreaterThan(1);
		for (const [, cls] of ticks) {
			// A 4px tick at the row's middle, off the line.
			expect(cls).toContain(
				"before:absolute before:top-1/2 before:left-0 before:z-10 before:h-px before:w-1 before:bg-border-strong",
			);
			// 6px, in accent, at the current child's row.
			expect(cls).toContain(
				"has-[[aria-current=page]]:before:w-1.5 has-[[aria-current=page]]:before:bg-accent",
			);
		}
	});

	it("sets children at 32px and 14px, under the parent's label", async () => {
		const row = tag(sidebar(await app("/catalog/skills")), "nav-skills");
		expect(row).toContain("h-8 pr-3 pl-[17px] type-small font-[450]");
	});
});

describe("type and rhythm", () => {
	it("sets rows at weight 450, muted, and current at 500 in full colour", async () => {
		const row = decoded(tag(sidebar(await app("/missions")), "nav-clients"));
		expect(row).toContain("type-body font-[450] text-text-muted");
		expect(row).toContain("aria-[current=page]:font-medium");
		expect(row).toContain("aria-[current=page]:text-foreground");
		expect(row).toContain("aria-[current=page]:[&>svg]:text-accent-text");
		// Hover is a soft steel plate fill.
		expect(row).toContain("hover:bg-state-hover");
	});

	it("engraves the group labels", async () => {
		const html = sidebar(await app("/missions"));
		const labels = [...html.matchAll(/<h2 class="([^"]+)"/g)].map((m) => m[1]);
		expect(labels).toHaveLength(3);
		for (const cls of labels) {
			expect(cls).toMatch(/\bengraved\b/);
			expect(cls).toContain("type-caption text-text-subtle");
		}
	});

	it("brushes the sidebar's frame", async () => {
		expect(tag(sidebar(await app("/missions")), "sidebar-body")).toMatch(
			/class="brushed /,
		);
	});

	it("sets no Inter-only font features, now that the face is Geist (ruling 28)", async () => {
		expect(
			decoded(tag(sidebar(await app("/missions")), "sidebar-body")),
		).not.toContain("font-feature-settings");
	});

	it("puts 16px between groups and 2px between rows", async () => {
		const html = sidebar(await app("/missions"));
		expect(tag(html, "sidebar-nav")).toMatch(/\bflex-col gap-4\b/);
		expect(html).toMatch(/<h2 class="[^"]*type-caption text-text-subtle/);
		expect(html).toMatch(/<\/h2><ul class="flex flex-col gap-0\.5">/);
	});

	it("keeps every top-level row 36px", async () => {
		const html = sidebar(await app("/catalog/skills"));
		for (const id of ["nav-missions", "nav-agents"]) {
			expect(tag(html, id)).toMatch(/\bh-9\b/);
		}
	});

	it("aligns a nested label with its parent's label, not its icon", async () => {
		// Parent label: 12px padding + 16px icon + 10px gap = 38px. Nested: the
		// guide line at 20px (ml-5), 1px wide, then 17px of padding = 38px.
		const html = sidebar(await app("/catalog/skills"));
		expect(tag(html, "nav-agents")).toMatch(/\bgap-2\.5\b[^"]*\bpx-3\b/);
		expect(tag(html, "nav-skills")).toContain("pl-[17px]");
	});

	it("fades in a soft hover fill over 120ms and brightens the icon", async () => {
		const row = decoded(tag(sidebar(await app("/missions")), "nav-clients"));
		expect(row).toContain("hover:bg-state-hover");
		expect(row).toContain("duration-(--duration-micro) ease-avel");
		expect(row).toContain("[&>svg]:text-text-subtle");
		expect(row).toContain("hover:[&>svg]:text-foreground");
	});

	it("rotates the chevron over the state duration", async () => {
		const parent = element(
			sidebar(await app("/missions")),
			"nav-agents",
			"</button>",
		);
		expect(parent).toMatch(
			/<svg[^>]*transition-\[rotate,opacity\] duration-\(--duration-state\)/,
		);
	});
});

describe("the sidebar's furniture", () => {
	it("has no search, no theme toggle and no recent work", async () => {
		const html = sidebar(await app("/missions"));
		expect(html).not.toContain("sidebar-search");
		expect(html).not.toContain("theme-toggle");
		expect(html).not.toContain("recent-work");
		expect(html).not.toMatch(/Recent work/);
	});

	it("puts the collapse control in the brand row, at the top", async () => {
		const html = sidebar(await app("/missions"));
		const brand = html.indexOf('data-testid="brand"');
		const collapse = html.indexOf('data-testid="sidebar-collapse"');
		const nav = html.indexOf('data-testid="sidebar-nav"');
		expect(brand).toBeGreaterThan(-1);
		expect(collapse).toBeGreaterThan(brand);
		expect(collapse).toBeLessThan(nav);
		expect(tag(html, "sidebar-collapse")).toContain(
			'aria-keyshortcuts="Meta+B Control+B"',
		);
	});

	it("scrolls without drawing a scrollbar", async () => {
		const html = sidebar(await app("/missions"));
		expect(tag(html, "sidebar-nav")).toMatch(
			/class="[^"]*\bno-scrollbar\b[^"]*\boverflow-y-auto\b/,
		);
	});

	it("draws the operator as a card, with a ringed avatar on the centre line", async () => {
		const html = sidebar(await app("/missions"));
		const card = tag(html, "operator-menu");
		// A machined card at rest (ruling 30), a raised plate on hover.
		expect(card).toContain(
			"surface-steel rounded-md border border-border bg-app-band",
		);
		expect(card).toContain("hover:bg-app-raised");
		// 8px footer padding + 1px border + 3px puts the avatar 12px in.
		expect(card).toContain("pl-[3px]");
		expect(tag(html, "operator-avatar")).toContain(
			"size-8 ring-1 ring-border-strong",
		);
	});

	it("names the signed-in operator in the footer, as a menu", async () => {
		const html = sidebar(await app("/missions"));
		expect(tag(html, "operator-menu")).toContain('aria-haspopup="menu"');
		expect(tag(html, "operator-menu")).toContain(
			`aria-label="${TEST_OPERATOR.name}, ${OPERATOR_ROLE}. Account menu"`,
		);
		expect(element(html, "operator-name", "</span>")).toContain(
			`>${TEST_OPERATOR.name}<`,
		);
		// The role is a constant: single-user, no role seam (TECH-STACK.md).
		expect(element(html, "operator-role", "</span>")).toContain(">Owner<");
		expect(element(html, "operator-avatar", "</span></span>")).toContain(
			`>${initials(TEST_OPERATOR.name)}<`,
		);
		expect(html).not.toContain("Javaris");
	});

	it("has a data-testid on every interactive element", async () => {
		const html = sidebar(await app("/catalog/skills"));
		const interactive = html.match(/<(a|button)\s[^>]*>/g) ?? [];
		expect(interactive.length).toBeGreaterThan(12);
		expect(interactive.filter((t) => !t.includes("data-testid="))).toEqual([]);
	});
});

describe("moving between pages", () => {
	it("draws the glow as one indicator, positioned inside the nav", async () => {
		const html = sidebar(await app("/missions"));
		expect(tag(html, "sidebar-nav")).toMatch(
			/class="[^"]*\bgroup\/nav\b[^"]*\brelative\b/,
		);
		expect(count(html, 'data-testid="nav-indicator"')).toBe(1);
		const indicator = tag(html, "nav-indicator");
		// Placed by its measured box, left and width included, so a nested
		// row's plate starts at the ruler.
		expect(indicator).toMatch(/\babsolute top-0 left-0\b/);
		expect(decoded(indicator)).toContain(
			'style="transform:translate(0px, 0px);width:0;height:0"',
		);
		expect(html.slice(html.indexOf(indicator))).toMatch(
			/^[\s\S]*?data-testid="nav-active-wash"[\s\S]*?data-testid="nav-active-core"/,
		);
	});

	it("rides the glow on a machined plate, under the label", async () => {
		const html = sidebar(await app("/missions"));
		const plate =
			"surface-steel rounded-sm border border-border bg-app-raised overflow-hidden";
		expect(tag(html, "nav-indicator")).toContain(plate);
		const mark = tag(html, "nav-active-mark");
		expect(mark).toContain(plate);
		// Under the label: behind it in the row's own isolated stack.
		expect(mark).toContain("absolute inset-0 -z-10");
		expect(tag(html, "nav-missions")).toMatch(/class="relative isolate /);
	});

	it("slides over the state duration once it has moved, and jumps under reduced motion", async () => {
		const indicator = decoded(
			tag(sidebar(await app("/missions")), "nav-indicator"),
		);
		expect(indicator).toContain(
			"data-animate:transition-[transform,width,height] data-animate:duration-(--duration-state) data-animate:ease-avel",
		);
		expect(indicator).toContain("motion-reduce:transition-none");
		// Placed without moving on its first measure: no data-animate yet.
		expect(indicator).not.toContain('data-animate=""');
	});

	it("is hidden until measured in the browser; the row's own mark paints first", async () => {
		const html = sidebar(await app("/missions"));
		expect(tag(html, "nav-indicator")).toMatch(/\bopacity-0\b/);
		expect(tag(html, "sidebar-nav")).not.toContain("data-indicator");
		const mark = decoded(tag(html, "nav-active-mark"));
		expect(mark).toContain("group-data-[indicator=ready]/nav:opacity-0");
	});

	it("enters each page with a fade and a 4px rise that leaves no transform", async () => {
		const { readFileSync } = await import("node:fs");
		const css = readFileSync(
			new URL("../src/styles/app.css", import.meta.url),
			"utf8",
		);
		const keyframes = css.slice(css.indexOf("@keyframes avelFadeIn"));
		expect(keyframes).toMatch(
			/from\s*\{\s*opacity: 0;\s*transform: translateY\(4px\);/,
		);
		expect(keyframes).toMatch(/to\s*\{\s*opacity: 1;\s*transform: none;/);
		expect(tag(await app("/missions"), "page-enter")).toContain(
			"animate-page-in",
		);
	});
});

describe("the rail", () => {
	it("keeps every row's geometry and fades the words", async () => {
		const html = await rail("/missions");
		const row = tag(html, "nav-missions");
		expect(row).toContain('aria-label="Missions"');
		expect(row).toMatch(/h-9 w-full[^"]* px-3/);
		expect(element(html, "nav-missions")).toMatch(
			/<span class="[^"]*opacity-0[^"]*">Missions</,
		);
	});

	it("turns a parent into a menu trigger, and marks it when it holds the page", async () => {
		const html = await rail("/settings/connections");
		const parent = tag(html, "nav-settings");
		expect(parent).toContain('aria-haspopup="menu"');
		expect(parent).toContain('aria-label="Settings"');
		expect(element(html, "nav-settings", "</button>")).toContain(
			'data-testid="nav-active-mark"',
		);
		expect(tag(html, "nav-settings-children")).not.toContain("data-expanded");
	});

	it("moves the collapse control under the mark", async () => {
		const html = await rail("/missions");
		expect(tag(html, "brand")).toContain(
			"h-[calc(var(--topbar-height)+2.5rem)]",
		);
		expect(tag(html, "sidebar-collapse")).toMatch(
			/top-\(--topbar-height\) left-3/,
		);
		expect(tag(html, "sidebar-collapse")).toContain(
			'aria-label="Expand sidebar"',
		);
	});
});

describe("the canvas (ruling 17)", () => {
	it("is a rounded, inset panel, and the only scroller", async () => {
		const html = await app("/missions");
		const shell = tag(html, "app-shell");
		expect(shell).toMatch(/\bh-dvh overflow-hidden\b/);
		expect(shell).toContain("pt-[env(safe-area-inset-top)]");
		const canvas = tag(html, "canvas");
		expect(canvas).toContain("overflow-hidden bg-card");
		expect(canvas).toContain("md:rounded-(--radius-canvas)");
		// Inset on all four sides (ruling 17): with no left inset the canvas's
		// left corners and border sat flush on the sidebar, lopsided against
		// the 8px on the other three sides.
		expect(canvas).toContain(" md:m-(--canvas-inset) ");
		// And no side-specific margin that would undo one side of it.
		expect(canvas).not.toMatch(/ md:m[xytrbl]-/);
		const scroller = tag(html, "canvas-scroll");
		expect(scroller).toMatch(/^<main id="main"/);
		expect(scroller).toContain("app-scroll");
		expect(scroller).toContain("overflow-y-auto");
		expect(tag(html, "skip-link")).toContain('href="#main"');
	});

	it("has no border on the sidebar: the gap is the seam", async () => {
		expect(tag(await app("/missions"), "sidebar")).not.toContain("border-r");
	});

	it("enters each page with the page-in animation", async () => {
		expect(tag(await app("/missions"), "page-enter")).toContain(
			"animate-page-in",
		);
	});

	it("lines the brand row up with the top bar across the seam", async () => {
		const brand = tag(await app("/missions"), "brand");
		expect(brand).toContain("h-(--topbar-height)");
		expect(brand).toContain("md:mt-(--canvas-inset)");
	});
});

describe("⌘B and Ctrl B", () => {
	const press = (key: string, mods: Partial<KeyboardEvent> = {}) => ({
		key,
		metaKey: false,
		ctrlKey: false,
		altKey: false,
		shiftKey: false,
		...mods,
	});

	it("match with either modifier, in either case", () => {
		expect(isShortcut(press("b", { metaKey: true }), "b")).toBe(true);
		expect(isShortcut(press("B", { ctrlKey: true }), "b")).toBe(true);
	});

	it("do not match without a modifier, or with another one", () => {
		expect(isShortcut(press("b"), "b")).toBe(false);
		expect(isShortcut(press("b", { ctrlKey: true, shiftKey: true }), "b")).toBe(
			false,
		);
		expect(isShortcut(press("k", { metaKey: true }), "b")).toBe(false);
	});
});
