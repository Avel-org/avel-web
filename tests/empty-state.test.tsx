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
	it("centres itself in whatever height it is given, and enters gently", () => {
		const root = tagOf(full, "empty-state");
		for (const cls of [
			"flex-1",
			"items-center",
			"justify-center",
			"text-center",
			"animate-page-in",
		]) {
			expect(root).toMatch(new RegExp(`\\b${cls}\\b`));
		}
	});

	it("sets its icon in a 48px tile with a hairline, at 20px and muted", () => {
		const tile = tagOf(full, "empty-state-icon");
		for (const cls of [
			"size-12",
			"rounded-lg",
			"border",
			"border-border",
			"bg-app-band",
			"shadow-e1",
		]) {
			expect(tile).toMatch(new RegExp(`(?:"|\\s)${cls}(?:"|\\s)`));
		}
		expect(full).toMatch(
			/<svg[^>]*class="lucide lucide-layers[^"]*\ssize-5 text-text-muted"/,
		);
	});

	it("sets title and description in the type scale, balanced and readable", () => {
		const title = tagOf(full, "empty-state-title");
		expect(title).toMatch(/^<h2[^>]*\btype-h2\b/);
		expect(title).toMatch(/\btext-balance\b/);
		const description = tagOf(full, "empty-state-description");
		// Body size, not small: this is the one sentence the operator reads.
		expect(description).toMatch(/\btype-body\b/);
		expect(description).toMatch(/\btext-text-muted\b/);
		expect(description).toMatch(/\bmax-w-md\b/);
		expect(description).toMatch(/\btext-pretty\b/);
	});

	it("names the absence in a dashed status pill above the title", () => {
		const eyebrow = tagOf(full, "empty-state-eyebrow");
		expect(full).toMatch(/data-testid="empty-state-eyebrow"[^>]*>Not built</);
		// Dashed marks a placeholder (AVEL-DESIGN.md section 8).
		expect(eyebrow).toMatch(/\brounded-full\b[^"]*\bborder-dashed\b/);
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
	["/presets", "preset-list", ["preset.list"]],
	["/playbooks", "playbook-list", []],
	["/settings/repositories", "repo-policies", []],
	["/settings/connections", "connection-list", []],
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
		const body = tagOf(await renderPage("/presets"), "page-body");
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
