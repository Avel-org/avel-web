import { connectionStatus } from "avel-server/contract";
import { describe, expect, it } from "vitest";
import { CONNECTION_WRITE_REASON } from "@/components/avel/connection-list";
import { CONNECTION_STATUS, connectionCountLabel } from "@/lib/api/connections";
import { Route } from "../src/routes/settings.connections";
import {
	CONNECTIONS,
	connection,
	internalError,
	renderSeeded,
	seededClient,
} from "./catalog-fixtures";
import { renderPage, tagOf } from "./render-page";

/*
 * /settings/connections, live from GET /api/connections (module 2),
 * rendered through the real router with a seeded QueryClient in each of its
 * four states. Tokens are never shown: a row carries the name of the
 * environment variable that holds one, and nothing else.
 */

/** One element from its opening tag to its matching close, by start index. */
function elementAt(html: string, start: number): string {
	const tag = /^<([a-z0-9]+)/.exec(html.slice(start))?.[1] ?? "";
	const re = new RegExp(`<${tag}[\\s>]|</${tag}>`, "g");
	re.lastIndex = start;
	let depth = 0;
	for (let m = re.exec(html); m; m = re.exec(html)) {
		depth += m[0].startsWith("</") ? -1 : 1;
		if (depth === 0) return html.slice(start, re.lastIndex);
	}
	throw new Error(`unclosed element at ${start}`);
}

function element(html: string, testid: string): string {
	const at = html.indexOf(`data-testid="${testid}"`);
	expect(at, testid).toBeGreaterThan(-1);
	return elementAt(html, html.lastIndexOf("<", at));
}

/** A real write control: disabled, with its reason linked for screen readers. */
function expectDisabledWithReason(
	html: string,
	testid: string,
	reason: string,
) {
	const tag = tagOf(html, testid);
	expect(tag, testid).toMatch(/\sdisabled=""/);
	const describedBy = tag.match(/aria-describedby="([^"]+)"/)?.[1];
	expect(describedBy, testid).toBeDefined();
	expect(html).toContain(
		`id="${describedBy}" data-slot="button-reason" class="sr-only">${reason.replaceAll("'", "&#x27;")}<`,
	);
}

const PATH = "/settings/connections";

describe("the Connections page", () => {
	it("is a construction route, titled from the sidebar, with one heading", async () => {
		expect(Route.options.staticData?.device).toBe("construction");
		const html = await renderPage(PATH);
		expect(html).toContain("<title>Connections · AVEL</title>");
		expect(html.match(/<h1[\s>]/g)).toHaveLength(1);
	});

	it("loads the real list: a few skeleton rows, never the not-built state", async () => {
		const html = await renderPage(PATH);
		expect(tagOf(html, "connection-list")).toContain('data-state="loading"');
		expect(
			html.match(/data-testid="connection-list-skeleton-row"/g),
		).toHaveLength(3);
		expect(html).not.toContain('data-state="not-built"');
		expect(html).not.toContain("surface-not-built");
		// The definition stays as the subtitle until a count is known.
		expect(html).toContain('data-testid="topbar-definition"');
		expect(html).not.toContain('data-testid="topbar-subtitle"');
	});

	it("offers New connection as a real button, disabled with its reason", async () => {
		const html = await renderPage(PATH);
		expectDisabledWithReason(html, "connections-new", CONNECTION_WRITE_REASON);
		expect(tagOf(html, "connections-new")).toContain('data-size="sm"');
	});

	it("lists each connection: scope, kind, status, created, and only the credential's name", async () => {
		const html = await renderSeeded(
			PATH,
			seededClient({ connections: CONNECTIONS }),
		);
		expect(tagOf(html, "connection-list")).toContain('data-state="success"');
		const table = element(html, "connection-table");
		expect(table.match(/data-testid="connection-table-row-/g)).toHaveLength(
			CONNECTIONS.length,
		);
		for (const c of CONNECTIONS) {
			const row = element(table, `connection-table-row-${c.id}`);
			expect(row).toContain(c.label);
			expect(tagOf(row, `connection-scope-${c.id}`)).toMatch(
				/class="[^"]*\btype-mono-small\b/,
			);
			expect(element(row, `connection-scope-${c.id}`)).toContain(
				`>${c.scopeValue}<`,
			);
			expect(row).toContain(
				c.scopeType === "owner" ? ">Owner<" : ">Repository<",
			);
			expect(element(row, `connection-kind-${c.id}`)).toContain(">GitHub<");
			expect(tagOf(row, `connection-status-${c.id}`)).toContain(
				`data-tone="${CONNECTION_STATUS[c.status].tone}"`,
			);
			expect(element(row, `connection-status-${c.id}`)).toContain(
				`>${CONNECTION_STATUS[c.status].label}<`,
			);
			expect(row).toContain(`>${c.createdAt.slice(0, 10)}<`);
			expect(element(row, `connection-credential-${c.id}`)).toContain(
				`>${c.credentialRef}<`,
			);
		}
		// Nothing shaped like a token anywhere on the page.
		expect(html).not.toMatch(/\bgh[pousr]_[A-Za-z0-9]{8,}/);
		expect(html).not.toMatch(/github_pat_/);
		expect(element(html, "connection-list")).not.toContain("·");
	});

	it("tones every status the contract knows: active passes, expired warns, revoked is stale", () => {
		expect(Object.keys(CONNECTION_STATUS).sort()).toEqual(
			[...connectionStatus.options].sort(),
		);
		expect(CONNECTION_STATUS.active.tone).toBe("pass");
		expect(CONNECTION_STATUS.expired.tone).toBe("warn");
		expect(CONNECTION_STATUS.revoked.tone).toBe("stale");
	});

	it("counts from meta.total in the top bar, never from the rows loaded", async () => {
		const html = await renderSeeded(
			PATH,
			seededClient({
				connections: { rows: [connection(1)], total: 12, nextCursor: "c2" },
			}),
		);
		expect(element(html, "topbar-subtitle")).toContain(">12 connections<");
		expect(element(html, "connections-showing")).toContain(">Showing 1 of 12<");
		expect(tagOf(html, "connections-load-more")).not.toMatch(/\sdisabled=""/);
		const five = await renderSeeded(
			PATH,
			seededClient({ connections: CONNECTIONS }),
		);
		expect(element(five, "topbar-subtitle")).toContain(">5 connections<");
		expect(five).not.toContain('data-testid="connections-load-more"');
		expect(connectionCountLabel(1)).toBe("1 connection");
		expect(connectionCountLabel(5)).toBe("5 connections");
	});

	it("says when there are none, with the real New connection disabled", async () => {
		const html = await renderSeeded(PATH, seededClient({ connections: [] }));
		expect(tagOf(html, "connection-list")).toContain('data-state="empty"');
		expect(html).toContain('data-testid="connections-empty"');
		expect(
			html.match(/data-testid="empty-state-description"[^>]*>([^<]+)</)?.[1],
		).not.toMatch(/contract|avel-server|not built|yet\b|route/i);
		expectDisabledWithReason(
			html,
			"connections-empty-new",
			CONNECTION_WRITE_REASON,
		);
		expect(element(html, "topbar-subtitle")).toContain(">0 connections<");
	});

	it("shows the error state when the list fails, with the request reference", async () => {
		const html = await renderSeeded(
			PATH,
			seededClient({ connections: internalError("/api/connections") }),
		);
		expect(tagOf(html, "connection-list")).toContain('data-state="error"');
		expect(html).toContain('data-testid="surface-error"');
		expect(html).toContain(">req_catalog<");
		// A read may be retried.
		expect(html).toContain('data-testid="surface-error-retry"');
		expectDisabledWithReason(html, "connections-new", CONNECTION_WRITE_REASON);
	});
});
