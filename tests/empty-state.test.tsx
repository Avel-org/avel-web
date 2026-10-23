import { Layers } from "lucide-react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EmptyState } from "@/components/avel/empty-state";
import { linkFor } from "../src/shell/nav";
import { renderPage, tagOf } from "./render-page";

const full = renderToString(
	<EmptyState
		icon={Layers}
		eyebrow="Not built"
		title="Saved rosters"
		description="Rosters you can apply to a mission."
		needs={["preset.list"]}
		action={<button type="button">Act</button>}
	/>,
);
const bare = renderToString(
	<EmptyState icon={Layers} title="T" description="D" />,
);

describe("EmptyState", () => {
	it("centres itself in whatever height it is given, on v3's dashed band", () => {
		const root = tagOf(full, "empty-state");
		for (const cls of [
			"flex-1",
			"items-center",
			"justify-center",
			"text-center",
			"rounded-card",
			"border-dashed",
			"border-border-strong",
			"bg-app-hollow",
		]) {
			expect(root).toMatch(new RegExp(`(?:"|\\s)${cls}(?:"|\\s)`));
		}
		expect(root).not.toMatch(/animate-/);
	});

	it("sets its icon in a ringed 32px tile, at 16px and subtle", () => {
		const tile = tagOf(full, "empty-state-icon");
		for (const cls of [
			"size-tile-md",
			"rounded-tile",
			"border",
			"border-border",
			"bg-app-panel",
		]) {
			expect(tile).toMatch(new RegExp(`(?:"|\\s)${cls}(?:"|\\s)`));
		}
		expect(full).toMatch(
			/<svg[^>]*class="lucide lucide-layers[^"]*\ssize-4 text-text-subtle"/,
		);
	});

	it("sets title and description in the type scale, balanced and readable", () => {
		const title = tagOf(full, "empty-state-title");
		expect(title).toMatch(/^<h2[^>]*\btype-title\b/);
		expect(title).toMatch(/\btext-balance\b/);
		const description = tagOf(full, "empty-state-description");
		// v3's empty state (UX 8): a caption, held to a readable measure.
		expect(description).toMatch(/\btype-caption\b/);
		expect(description).toMatch(/\btext-text-muted\b/);
		expect(description).toMatch(/max-w-\[38ch\]/);
		expect(description).toMatch(/\btext-pretty\b/);
	});

	it("names the absence in a dashed status pill above the title", () => {
		const eyebrow = tagOf(full, "empty-state-eyebrow");
		expect(full).toMatch(/data-testid="empty-state-eyebrow"[^>]*>Not built</);
		// Dashed marks a placeholder (AVEL-DESIGN.md section 8).
		expect(eyebrow).toMatch(/\brounded-sm\b[^"]*\bborder-dashed\b/);
		expect(full.indexOf("empty-state-eyebrow")).toBeLessThan(
			full.indexOf("empty-state-title"),
		);
		expect(bare).not.toContain("empty-state-eyebrow");
	});

	it("sets what it waits on apart, below a hairline, as tags", () => {
		const needs = tagOf(full, "empty-state-needs");
		expect(needs).toMatch(/\bborder-t border-border\b/);
		expect(full).toMatch(
			/data-testid="empty-state-needs"[^>]*><span[^>]*>Waiting on</,
		);
		expect(tagOf(full, "empty-state-need")).toContain('data-variant="tag"');
		expect(full).toMatch(/data-testid="empty-state-need"[^>]*>preset\.list</);
		expect(bare).not.toContain("empty-state-needs");
	});

	it("renders an action slot only when given one", () => {
		expect(full).toMatch(/data-testid="empty-state-action"[^>]*><button/);
		expect(bare).not.toContain("empty-state-action");
	});
});

/** Every stub route, with exactly the procedures a doc names for it. */
const STUBS: [string, string, string[]][] = [
	["/settings/repositories", "repo-policies", []],
	["/settings/account", "account-settings", []],
];

describe("every route with no data states it, centred in the page", () => {
	for (const [to, testid, needs] of STUBS) {
		it(`${to}: not built, its own icon, only documented needs`, async () => {
			const html = await renderPage(to);
			expect(html).toContain(`data-testid="${testid}" data-state="not-built"`);

			const iconClass = renderToString(<IconOf to={to} />).match(
				/class="lucide (lucide-[a-z0-9-]+)/,
			)?.[1];
			const tile = html.slice(html.indexOf('data-testid="empty-state-icon"'));
			expect(iconClass).toBeDefined();
			expect(tile).toMatch(new RegExp(`^[^>]*>\\s*<svg[^>]*${iconClass}\\b`));

			const listed = [
				...html.matchAll(/data-testid="surface-not-built-need"[^>]*>([^<]+)</g),
			].map((m) => m[1]);
			expect(listed).toEqual(needs);

			const title = html.match(
				/data-testid="empty-state-title"[^>]*>([^<]+)</,
			)?.[1];
			expect(title).toBeDefined();
			expect(title).toMatch(/^[A-Z][^A-Z]*$/);
		});
	}

	it("lets the body grow so the empty state can centre in it", async () => {
		const body = tagOf(await renderPage("/settings/account"), "page-body");
		for (const cls of ["flex-1", "flex", "flex-col"]) {
			expect(body).toMatch(new RegExp(`(?:"|\\s)${cls}(?:"|\\s)`));
		}
	});

	it("keeps build status out of the sentences: the pill and tags carry it", async () => {
		for (const [to] of STUBS) {
			const html = await renderPage(to);
			const description = html.match(
				/data-testid="empty-state-description"[^>]*>([^<]+)</,
			)?.[1];
			expect(description).toBeDefined();
			expect(description).not.toMatch(
				/contract|avel-server|not built|yet\b|route/i,
			);
		}
	});
});

function IconOf({ to }: { to: string }) {
	const Icon = linkFor(to).icon;
	return <Icon />;
}
