import type { QueryClient } from "@tanstack/react-query";
import type { CanonSession, RunStep } from "avel-server/contract";
import { describe, expect, it } from "vitest";
import {
	CanonSessionActions,
	CanonSessionTitle,
	canonChatTitle,
	canonTitleProblem,
} from "@/components/avel/canon-chat-actions";
import { CanonModeSwitch } from "@/components/avel/canon-chat-mode";
import { formatCell, isUsdColumn } from "@/components/avel/canon-chat-parts";
import { CanonChatRail } from "@/components/avel/canon-chat-rail";
import { CanonChatStart } from "@/components/avel/canon-chat-start";
import {
	formatDuration,
	stepsByTurn,
	traceItems,
} from "@/components/avel/canon-chat-trace";
import { endedCopy } from "@/components/avel/canon-chat-view";
import { CanonMessageRow, CanonThread } from "@/components/avel/canon-panel";
import { HomeChat } from "@/components/avel/home-chat";
import { queryKeys } from "@/lib/api/keys";
import {
	chatItem,
	element,
	message,
	openChat,
	pages,
	render,
	SESSION,
	session,
	step,
} from "./canon-fixtures";
import { tagOf, textOfId } from "./render-page";

/**
 * Canon chat on Home and the parts it shares with the intake's panel: the
 * mode switch, a reply's cards and tables, the run trace, the session's
 * actions, the chat list, a new chat and an ended one.
 */

const OTHER = "00000000-0000-4000-8000-000000000702";
const noop = () => {};

/** The reason a disabled control carries, read through aria-describedby. */
const reasonOf = (html: string, testid: string) =>
	textOfId(
		html,
		tagOf(html, testid).match(/aria-describedby="([^"]+)"/)?.[1] ?? "",
	);

const seedChat =
	(s: CanonSession, messages = [message(1)], steps: RunStep[] = []) =>
	(qc: QueryClient) => {
		qc.setQueryData([...queryKeys.canon.session(s.id)], s);
		qc.setQueryData([...queryKeys.canon.messages(s.id)], messages);
		qc.setQueryData([...queryKeys.canon.steps(s.id)], steps);
	};

describe("the mode switch", () => {
	it("offers ask and fetch on an open chat, and holds draft back with why", async () => {
		const html = await render(
			<CanonModeSwitch value="ask" hasIntake={false} onChange={noop} />,
		);
		expect(tagOf(html, "canon-mode-ask")).toContain('aria-pressed="true"');
		expect(tagOf(html, "canon-mode-fetch")).not.toMatch(/\sdisabled=""/);
		expect(tagOf(html, "canon-mode-draft")).toMatch(/\sdisabled=""/);
		expect(reasonOf(html, "canon-mode-draft")).toBe(
			"Draft needs an intake. Brief one from its intake page.",
		);
	});

	it("offers draft on an intake's session, and never disables the mode in use", async () => {
		const html = await render(
			<CanonModeSwitch
				value="draft"
				hasIntake
				disabledReason="Canon is answering"
				onChange={noop}
			/>,
		);
		expect(tagOf(html, "canon-mode-draft")).not.toMatch(/\sdisabled=""/);
		expect(reasonOf(html, "canon-mode-ask")).toBe("Canon is answering");
	});
});

describe("a reply's parts", () => {
	it("formats cells: dollars by column, times in UTC, none as a dash", () => {
		expect(formatCell(0.0421, true)).toBe("$0.0421");
		expect(formatCell(1234.5)).toBe("1,234.5");
		expect(formatCell("2026-10-19T09:00:00.000Z")).toBe(
			"Oct 19, 2026, 9:00 AM UTC",
		);
		expect(formatCell(null)).toBe("—");
		expect(formatCell(true)).toBe("Yes");
		expect(formatCell("plain")).toBe("plain");
		expect(isUsdColumn("spend", "Spent (USD)")).toBe(true);
		expect(isUsdColumn("spendUsd")).toBe(true);
		expect(isUsdColumn("tokens", "Tokens")).toBe(false);
	});

	it("renders text, an entity card that links to its page, and a compact table", async () => {
		const mission = "00000000-0000-4000-8000-000000000990";
		const reply = message(2, {
			role: "canon",
			mode: "fetch",
			parts: [
				{ type: "text", md: "**Two** missions." },
				{
					type: "entity",
					entityType: "mission",
					id: mission,
					fields: { name: "Booking", spendUsd: 1.5, status: "active" },
				},
				{
					type: "table",
					columns: [
						{ key: "name", label: "Mission" },
						{ key: "spend", label: "Spent (USD)" },
						{ key: "startedAt", label: "Started" },
					],
					rows: [
						{
							name: "Booking",
							spend: 12.4,
							startedAt: "2026-10-19T09:00:00.000Z",
						},
					],
				},
			],
		});
		const html = await render(<CanonMessageRow message={reply} />);
		expect(element(html, "canon-part-2-0")).toContain("<strong");
		const card = element(html, "canon-part-2-1");
		expect(card).toContain(`href="/missions/${mission}"`);
		expect(card).toContain(">Mission<");
		expect(card).toContain(">Booking<");
		expect(card).toContain(">$1.50<");
		const table = element(html, "canon-part-2-2");
		expect(table).toContain(">Spent (USD)<");
		expect(table).toContain(">$12.40<");
		expect(table).toContain("Oct 19, 2026, 9:00 AM UTC");
	});

	it("renders nothing for a reply with no parts", async () => {
		const html = await render(
			<CanonMessageRow message={message(2, { role: "canon" })} />,
		);
		expect(html).not.toContain("canon-parts-2");
	});
});

describe("the run trace", () => {
	const turn = [
		step(1, {
			kind: "reasoning_summary",
			label: "Thinking",
			detail: { text: "Plan" },
		}),
		step(2, {
			kind: "tool_call",
			label: "Calling fetch",
			detail: { tool: "fetch", input: { entity: "missions" } },
		}),
		step(3, {
			kind: "tool_result",
			label: "fetch answered",
			detail: { tool: "fetch", callSeq: 2, isError: false, text: "2 rows" },
		}),
		step(4, { detail: { text: "Two " } }),
		step(5, { detail: { text: "missions." } }),
	];

	it("pairs a call with its result and joins a run of text into one row", () => {
		const items = traceItems(turn);
		expect(items.map((i) => i.kind)).toEqual(["reasoning", "tool", "text"]);
		const tool = items[1];
		expect(tool?.kind === "tool" && tool.result?.seq).toBe(3);
		const text = items[2];
		expect(text?.kind === "text" && text.steps.length).toBe(2);
	});

	it("groups steps by the turn that took them", () => {
		const turns = stepsByTurn([...turn, step(9, { turn: 3 })]);
		expect([...turns.keys()]).toEqual([1, 3]);
		expect(turns.get(1)).toHaveLength(5);
	});

	it("says how long a step took", () => {
		expect(formatDuration(1_500)).toBe("1.5s");
		expect(formatDuration(125_000)).toBe("2m 5s");
	});

	it("folds a finished turn's trace between the operator's message and Canon's reply", async () => {
		const html = await render(
			<CanonThread session={openChat()} />,
			seedChat(
				openChat(),
				[
					message(1, { mode: "ask" }),
					message(2, { role: "canon", mode: "ask" }),
				],
				turn,
			),
		);
		const trace = html.indexOf('data-testid="canon-trace-1"');
		expect(trace).toBeGreaterThan(
			html.indexOf('data-testid="canon-message-1"'),
		);
		expect(trace).toBeLessThan(html.indexOf('data-testid="canon-message-2"'));
		expect(tagOf(html, "canon-trace-toggle-1")).toContain(
			'aria-expanded="false"',
		);
		expect(element(html, "canon-trace-toggle-1")).toContain("Worked for 1.5s");
		expect(html).not.toContain("canon-trace-steps-1");
	});

	it("opens the running turn's trace, its unfinished call spinning", async () => {
		const live = openChat({ turn: "canon" });
		const html = await render(
			<CanonThread session={live} />,
			seedChat(live, [message(1, { mode: "ask" })], turn.slice(0, 2)),
		);
		expect(tagOf(html, "canon-trace-toggle-1")).toContain(
			'aria-expanded="true"',
		);
		expect(element(html, "canon-trace-toggle-1")).toContain("Working");
		expect(element(html, "canon-step-2")).toContain(
			'data-testid="canon-step-spinner"',
		);
		expect(element(html, "canon-step-2")).toContain("Calling fetch");
	});

	it("draws no trace for a turn with no steps", async () => {
		const html = await render(
			<CanonThread session={openChat()} />,
			seedChat(openChat(), [
				message(1, { mode: "ask" }),
				message(2, { role: "canon" }),
			]),
		);
		expect(html).not.toContain("canon-trace-");
	});
});

describe("modes on the thread", () => {
	it("tags an operator message only where its mode changes", async () => {
		const s = session({ mode: "draft" });
		const html = await render(
			<CanonThread session={s} />,
			seedChat(s, [
				message(1, { mode: "draft" }),
				message(2, { role: "canon" }),
				message(3, { mode: "ask" }),
				message(4, { mode: "ask" }),
			]),
		);
		expect(html).not.toContain("canon-message-mode-1");
		expect(element(html, "canon-message-mode-3")).toContain(">Ask<");
		expect(html).not.toContain("canon-message-mode-4");
	});

	it("keeps the message row and the trace memoized", () => {
		const memo = Symbol.for("react.memo");
		expect((CanonMessageRow as unknown as { $$typeof: symbol }).$$typeof).toBe(
			memo,
		);
	});
});

describe("a session's name", () => {
	it("is the title, else the first message's first line, else Untitled chat", () => {
		expect(canonChatTitle("Booking")).toBe("Booking");
		expect(canonChatTitle(null, "  Find the spend\nfor last week")).toBe(
			"Find the spend",
		);
		expect(canonChatTitle(null, "x".repeat(80))).toHaveLength(60);
		expect(canonChatTitle(null, null)).toBe("Untitled chat");
		expect(canonTitleProblem("   ")).toBe("Give the chat a name.");
		expect(canonTitleProblem("x".repeat(121))).toMatch(/at most 120/);
		expect(canonTitleProblem(" Fine ")).toBeUndefined();
	});

	it("says when Canon named it, and offers Rename", async () => {
		const html = await render(
			<CanonSessionTitle
				session={openChat({ title: "Spend review", titleSetBy: "canon" })}
			/>,
		);
		expect(element(html, "canon-title")).toContain(">Spend review<");
		expect(element(html, "canon-title-source")).toContain("Named by Canon");
		expect(tagOf(html, "canon-rename-open")).toContain(
			'aria-label="Rename chat"',
		);
	});
});

describe("a session's actions", () => {
	it("offers Halt, Close and Archive while open; Archive waits for Canon's turn", async () => {
		const html = await render(
			<CanonSessionActions session={openChat({ turn: "canon" })} />,
		);
		expect(tagOf(html, "canon-halt")).not.toMatch(/\sdisabled=""/);
		expect(reasonOf(html, "canon-archive")).toBe(
			"Canon is answering. Halt it first, or wait for its reply.",
		);
		expect(html).not.toContain('data-testid="canon-reopen"');
	});

	it("reopens an operator halt, but says why a token-ceiling halt can't", async () => {
		const mine = await render(
			<CanonSessionActions
				session={openChat({ status: "halted", haltReason: "operator" })}
			/>,
		);
		expect(tagOf(mine, "canon-reopen")).not.toMatch(/\sdisabled=""/);
		const final = await render(
			<CanonSessionActions
				session={openChat({
					status: "halted",
					haltReason: "token_hard_ceiling",
				})}
			/>,
		);
		expect(tagOf(final, "canon-reopen")).toMatch(/\sdisabled=""/);
		expect(reasonOf(final, "canon-reopen")).toMatch(/hard token limit/);
	});

	it("offers Unarchive, not Archive, on an archived session", async () => {
		const html = await render(
			<CanonSessionActions
				session={openChat({
					status: "closed",
					archivedAt: "2026-10-19T10:00:00.000Z",
				})}
			/>,
		);
		expect(html).toContain('data-testid="canon-unarchive"');
		expect(html).not.toContain('data-testid="canon-archive"');
	});
});

describe("the chat list", () => {
	const seedList =
		(rows: ReturnType<typeof chatItem>[], archived = false) =>
		(qc: QueryClient) =>
			qc.setQueryData([...queryKeys.canon.chats({ archived })], pages(rows));

	it("links each chat, names an untitled one, and marks the open one", async () => {
		const html = await render(
			<CanonChatRail selectedId={SESSION} />,
			seedList([
				chatItem({ title: "Booking flow" }),
				chatItem({ id: OTHER, title: null, status: "closed", mode: "fetch" }),
			]),
		);
		const mine = tagOf(html, `canon-chat-row-${SESSION}`);
		expect(mine).toContain(`href="/?chat=${SESSION}"`);
		expect(mine).toContain('aria-current="true"');
		expect(element(html, `canon-chat-row-${SESSION}`)).toContain(
			">Booking flow<",
		);
		const other = element(html, `canon-chat-row-${OTHER}`);
		expect(other).toContain(">Untitled chat<");
		expect(other).toContain('data-mode="fetch"');
		expect(other).toContain("Closed");
		expect(tagOf(html, `canon-chat-row-${OTHER}`)).not.toContain(
			"aria-current",
		);
		expect(tagOf(html, "canon-chat-shelf-active")).toContain(
			'aria-pressed="true"',
		);
	});

	it("says there are no chats yet, and how to start one", async () => {
		const html = await render(
			<CanonChatRail selectedId={null} />,
			seedList([]),
		);
		expect(element(html, "canon-chat-list-empty")).toContain("No chats yet");
	});
});

describe("a new chat", () => {
	it("starts in ask with no client, fetch on offer and draft held back", async () => {
		const html = await render(
			<CanonChatStart onStarted={noop} onShowChats={noop} />,
		);
		expect(tagOf(html, "canon-mode-ask")).toContain('aria-pressed="true"');
		expect(tagOf(html, "canon-mode-fetch")).not.toMatch(/\sdisabled=""/);
		expect(tagOf(html, "canon-mode-draft")).toMatch(/\sdisabled=""/);
		expect(element(html, "canon-chat-client")).toContain("No client");
		expect(html).toContain('data-testid="chat-composer-float"');
	});
});

describe("a chat on Home", () => {
	it("shows an open chat's header, thread and composer with the modes", async () => {
		const s = openChat({ title: "Spend" });
		const html = await render(<HomeChat chatId={SESSION} />, seedChat(s));
		expect(element(html, "canon-chat-scope")).toContain("Open chat");
		expect(element(html, "canon-session-mode")).toContain(">Ask<");
		expect(html).toContain('data-testid="canon-message-1"');
		expect(html).toContain('data-testid="canon-mode"');
		expect(html).not.toContain("home-chat-prompt");
	});

	it("says why an ended chat takes no message, and what brings it back", async () => {
		const s = openChat({ status: "halted", haltReason: "token_hard_ceiling" });
		const html = await render(<HomeChat chatId={SESSION} />, seedChat(s));
		expect(html).not.toContain('data-testid="canon-composer"');
		expect(element(html, "canon-chat-ended")).toContain(
			"can&#x27;t be reopened",
		);
		expect(tagOf(html, "canon-chat-ended-new")).toContain('href="/"');
		expect(
			endedCopy({ status: "closed", haltReason: null, archivedAt: "x" }),
		).toBe("This chat is closed. It is archived. Reopen it to keep writing.");
	});
});
