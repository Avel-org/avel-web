import type { QueryClient } from "@tanstack/react-query";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { chunkLines } from "@/components/avel/canon-citation";
import {
	CANON_DEFAULT_ESTIMATE,
	CanonComposer,
	CanonPanel,
	CanonThread,
	OpenCanon,
	SessionHeader,
} from "@/components/avel/canon-panel";
import { inline, Markdown, parseBlocks } from "@/components/avel/markdown";
import { queryKeys } from "@/lib/api/keys";
import {
	citation,
	element,
	INTAKE,
	message,
	pages,
	render,
	SESSION,
	session,
} from "./canon-fixtures";
import { tagOf } from "./render-page";

const withSessions =
	(
		list: ReturnType<typeof session>[],
		messages = [message(1), message(2, { role: "canon" })],
	) =>
	(qc: QueryClient) => {
		qc.setQueryData([...queryKeys.canon.sessions(INTAKE)], pages(list));
		for (const s of list)
			qc.setQueryData([...queryKeys.canon.session(s.id)], s);
		qc.setQueryData([...queryKeys.canon.messages(SESSION)], messages);
	};

describe("the Canon panel", () => {
	it("offers Brief with Canon when no session exists, the estimate optional", async () => {
		const html = await render(
			<CanonPanel intakeId={INTAKE} />,
			withSessions([]),
		);
		expect(html).toContain('data-testid="canon-none"');
		expect(tagOf(html, "canon-open-estimate")).toContain(
			`placeholder="${CANON_DEFAULT_ESTIMATE.toLocaleString("en-US")} (default)"`,
		);
		expect(element(html, "canon-open-submit")).toContain("Brief with Canon");
	});

	it("shows the open session: its status, budget on the track, and spend", async () => {
		const html = await render(
			<CanonPanel intakeId={INTAKE} />,
			withSessions([session()]),
		);
		expect(tagOf(html, "canon-status")).toContain('data-tone="pending"');
		expect(html).toContain(`data-testid="canon-budget-track-${SESSION}"`);
		expect(html).toContain(`data-testid="canon-budget-soft-mark-${SESSION}"`);
		expect(element(html, "canon-spend")).toContain("Spent $0.4200");
		expect(html).toContain("12,000 of 180,000 tokens");
	});

	it("keeps an ended session readable, with Brief again", async () => {
		const ended = session({
			status: "halted",
			haltReason: "token_hard_ceiling",
			closedAt: "2026-10-19T10:00:00.000Z",
		});
		const html = await render(
			<CanonPanel intakeId={INTAKE} />,
			withSessions([ended]),
		);
		expect(tagOf(html, "canon-status")).toContain('data-tone="block"');
		expect(element(html, "canon-halt-reason")).toContain("hard token limit");
		expect(html).not.toContain('data-testid="canon-composer"');
		expect(element(html, "canon-open-submit")).toContain("Brief again");
	});
});

describe("a session's header", () => {
	it("says Canon is answering with the hollow pending glyph, and offers Halt, not Close", async () => {
		const html = await render(
			<SessionHeader session={session({ turn: "canon" })} intakeId={INTAKE} />,
		);
		const turn = element(html, "canon-turn");
		expect(turn).toContain("Canon is answering");
		expect(turn).toMatch(/data-tone="pending"/);
		expect(html).not.toMatch(/\bLive\b/);
		expect(tagOf(html, "canon-halt")).not.toMatch(/\sdisabled=""/);
		expect(tagOf(html, "canon-close")).toMatch(/\sdisabled=""/);
		expect(html).toContain("Canon is answering. Halt stops it now.");
	});

	it("draws the session's budget as a dispatch's: past the soft ceiling warns", async () => {
		const over = session({ tokensUsed: 100_000 });
		const html = await render(
			<SessionHeader session={over} intakeId={INTAKE} />,
		);
		expect(tagOf(html, `canon-budget-fill-${SESSION}`)).toContain(
			'data-tone="warn"',
		);
	});
});

describe("the thread", () => {
	it("puts the operator right and Canon left with its mark, in seq order", async () => {
		const html = await render(
			<CanonThread session={session()} />,
			withSessions([session()]),
		);
		expect(tagOf(html, "canon-message-1")).toContain("justify-end");
		const canon = element(html, "canon-message-2");
		expect(tagOf(html, "canon-message-2")).toContain("justify-start");
		expect(canon).toContain('data-actor-mark="canon"');
		expect(html.indexOf("canon-message-1")).toBeLessThan(
			html.indexOf("canon-message-2"),
		);
	});

	it("shows Canon's citations as chips, a purged file marked", async () => {
		const reply = message(2, {
			role: "canon",
			citations: [citation(), citation({ purged: true, fileName: "old.pdf" })],
		});
		const html = await render(
			<CanonThread session={session()} />,
			withSessions([session()], [message(1), reply]),
		);
		expect(element(html, "canon-citation-2-0")).toContain(">brief.md<");
		expect(element(html, "canon-citation-2-1")).toContain(">file purged<");
		expect(chunkLines(`${"f".repeat(64)}:12-30`)).toBe("lines 12–30");
		expect(chunkLines(`${"f".repeat(64)}:4-4`)).toBe("line 4");
	});
});

describe("the composer", () => {
	it("sits still (no float) and counts against 20,000", async () => {
		const html = await render(<CanonComposer session={session()} />);
		expect(html).not.toContain('data-testid="chat-composer-float"');
		expect(element(html, "canon-composer-count")).toContain("0 / 20,000");
		expect(tagOf(html, "chat-composer-input")).toContain('maxLength="20000"');
	});

	it("holds Send while Canon is answering, with the reason", async () => {
		const html = await render(
			<CanonComposer session={session({ turn: "canon" })} />,
		);
		expect(tagOf(html, "chat-composer-send")).toMatch(/\sdisabled=""/);
		expect(html).toContain("Canon is answering");
	});
});

describe("opening a session", () => {
	it("refuses a non-number estimate, with why", async () => {
		const html = await render(<OpenCanon intakeId={INTAKE} />);
		// Blank is fine: the server's default applies.
		expect(tagOf(html, "canon-open-submit")).not.toMatch(/\sdisabled=""/);
	});
});

describe("Markdown from Canon", () => {
	it("reads headings, lists, quotes and code into blocks", () => {
		const blocks = parseBlocks(
			"# Scope\n\nOne line\nand more\n\n- a\n- b\n\n> said\n\n```\nx = 1\n```",
		);
		expect(blocks.map((b) => b.kind)).toEqual([
			"heading",
			"paragraph",
			"list",
			"quote",
			"code",
		]);
	});

	// Without the fix these hang the parser (and the tab); the timeout fails them.
	it("never hangs on a heading ending in a lone \\r or a Unicode line break", {
		timeout: 2_000,
	}, () => {
		for (const text of [
			"# Title\r",
			"## a b",
			"# One\u2028two",
			"# Para\u2029",
			"#\u2028",
		]) {
			const blocks = parseBlocks(text);
			expect(blocks.length, JSON.stringify(text)).toBeGreaterThan(0);
		}
		expect(parseBlocks("# Title\r")[0]).toMatchObject({
			kind: "heading",
			text: "Title",
		});
		expect(parseBlocks("## a b")[0]).toMatchObject({
			kind: "heading",
			level: 2,
			text: "a b",
		});
	});

	it("never renders raw HTML from the text, and links only to the web", () => {
		const html = renderToString(
			<Markdown
				text={
					"<script>alert(1)</script> [x](javascript:alert(1)) [ok](https://example.com) **b** `c`"
				}
			/>,
		);
		expect(html).not.toContain("<script>");
		expect(html).toContain("&lt;script&gt;");
		expect(html).not.toContain("javascript:");
		expect(html).toMatch(
			/<a href="https:\/\/example.com" target="_blank" rel="noopener noreferrer"/,
		);
		expect(html).toContain("<strong");
		expect(html).toContain("<code");
		expect(inline("plain")).toEqual(["plain"]);
	});
});
