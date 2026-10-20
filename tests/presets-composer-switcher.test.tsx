import {
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import type { ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CanvasHint } from "@/components/avel/canvas";
import { HINT_TEXT } from "@/components/avel/preset-kanban";
import { TeamList } from "@/components/avel/preset-switcher";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ID, preset } from "./presets-fixtures";
import { tagOf } from "./render-page";

/** Inside a router: each team is a link to its ?preset. */
async function inRouter(node: ReactNode) {
	const root = createRootRoute({ component: () => <>{node}</> });
	const router = createRouter({
		routeTree: root.addChildren([
			createRoute({ getParentRoute: () => root, path: "/presets" }),
		]),
		history: createMemoryHistory({ initialEntries: ["/presets"] }),
	});
	await router.load();
	return renderToString(
		<TooltipProvider>
			<RouterProvider router={router} />
		</TooltipProvider>,
	);
}

const ONE = preset(1, { name: "Full build", version: 3 });
const TWO = preset(2, { name: "Discovery", cut: "horizontal", agents: [] });

const list = (props: Partial<Parameters<typeof TeamList>[0]> = {}) =>
	inRouter(
		<TeamList
			presets={[ONE, TWO]}
			selectedId={ONE.id}
			hasMore={false}
			loadingMore={false}
			onLoadMore={() => {}}
			onNew={() => {}}
			comparing={[]}
			onToggleCompare={() => {}}
			{...props}
		/>,
	);

describe("the team switcher's list", () => {
	it("lists every team as a link to its ?preset, the selected one marked", async () => {
		const html = await list();
		expect(tagOf(html, `preset-switcher-team-${ONE.id}`)).toContain(
			'data-selected="true"',
		);
		expect(tagOf(html, `preset-switcher-team-${TWO.id}`)).not.toContain(
			"data-selected",
		);
		expect(tagOf(html, `preset-open-${TWO.id}`)).toContain(`preset=${TWO.id}`);
		expect(html).toContain(">Discovery<");
		expect(html).toContain("By layer · 0 agents · v1");
	});

	it("searches with the shared SearchField, and ends with New team", async () => {
		const html = await list();
		expect(tagOf(html, "preset-switcher-search")).toContain("field-surface");
		expect(html.indexOf('data-testid="preset-switcher-new"')).toBeGreaterThan(
			html.indexOf(`preset-switcher-team-${TWO.id}`),
		);
	});

	it("offers Load more only while more pages remain", async () => {
		expect(await list()).not.toContain('data-testid="presets-load-more"');
		expect(await list({ hasMore: true })).toContain(
			'data-testid="presets-load-more"',
		);
	});

	it("shows the server's matches as given when the search is the caller's", async () => {
		// "Full" would hide Discovery if filtered locally; the server's
		// matches are what was loaded for that search, so all of them show.
		const html = await list({ query: "Full", onQueryChange: () => {} });
		expect(html).toContain(`preset-switcher-team-${TWO.id}`);
		const pending = await list({
			query: "Full",
			onQueryChange: () => {},
			pending: true,
			presets: [],
		});
		expect(pending).toContain(">Searching<");
		expect(pending).not.toContain("No team matches.");
	});

	it("keeps Compare on each team, held at two", async () => {
		const html = await list({ comparing: [ID(3), ID(4)] });
		expect(tagOf(html, `preset-compare-${ONE.id}`)).toMatch(/\sdisabled=""/);
	});
});

describe("the canvas's first-time hint", () => {
	it("says how the board works, and can be dismissed", () => {
		const html = renderToString(
			<TooltipProvider>
				<CanvasHint data-testid="preset-hint" onDismiss={() => {}}>
					{HINT_TEXT}
				</CanvasHint>
			</TooltipProvider>,
		);
		expect(html).toContain(HINT_TEXT.replaceAll("'", "&#x27;"));
		expect(HINT_TEXT).toMatch(
			/Enter to pick up, arrows to move, Enter to drop/,
		);
		expect(tagOf(html, "preset-hint-dismiss")).toContain(
			'aria-label="Dismiss the hint"',
		);
	});
});
