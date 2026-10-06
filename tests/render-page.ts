import {
	createMemoryHistory,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { SessionSourceProvider } from "../src/lib/auth";
import { routeTree } from "../src/routeTree.gen";
import { signedIn } from "./auth-session";

/**
 * A page rendered the way the server renders it: through the real router and
 * root layout, at its own path. Page reads the location for breadcrumbs and
 * the shell provides tooltips, the theme and ⌘K, so a page cannot be rendered
 * outside them. The node environment has no DOM; tests read the markup.
 */
export async function renderPage(path: string): Promise<string> {
	const router = createRouter({
		routeTree,
		history: createMemoryHistory({ initialEntries: [path] }),
	});
	await router.load();
	// Signed in, so the sign-in gate renders the shell and the page.
	return renderToString(
		createElement(
			SessionSourceProvider,
			{ source: signedIn() },
			createElement(RouterProvider, { router }),
		),
	);
}

/** The opening tag of the first element carrying this data-testid. */
export function tagOf(html: string, testid: string): string {
	const match = html.match(
		new RegExp(`<[a-z0-9]+[^>]*data-testid="${testid}"[^>]*>`),
	);
	if (!match) throw new Error(`no element with data-testid="${testid}"`);
	return match[0];
}

/** The opening tag of the element with this id. */
export function tagWithId(html: string, id: string): string {
	const match = html.match(new RegExp(`<[a-z0-9]+[^>]*\\sid="${id}"[^>]*>`));
	if (!match) throw new Error(`no element with id="${id}"`);
	return match[0];
}

/** The text directly inside the element with this id. */
export function textOfId(html: string, id: string): string {
	const match = html.match(new RegExp(`\\sid="${id}"[^>]*>([^<]*)<`));
	if (match?.[1] === undefined) throw new Error(`no element with id="${id}"`);
	return match[1];
}

/** How many times `text` appears as an element's whole text content. */
export function countText(html: string, text: string): number {
	const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	return html.match(new RegExp(`>${escaped}<`, "g"))?.length ?? 0;
}
