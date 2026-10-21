import {
	MutationObserver,
	QueryClient,
	type QueryFunctionContext,
} from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import {
	afterCanonMoved,
	afterCanonSessionWrite,
	archiveCanonSessionOptions,
	CANON_PAGE,
	CANON_STEP_POLL_MS,
	canonChatsQuery,
	canonReopenBlocked,
	canonSearchText,
	canonStepsQuery,
	createCanonSessionOptions,
	postCanonMessageOptions,
	reopenCanonSessionOptions,
	unarchiveCanonSessionOptions,
	updateCanonSessionOptions,
} from "@/lib/api/canon";
import { queryKeys } from "@/lib/api/keys";
import {
	CLIENT,
	chatItem,
	INTAKE,
	message,
	openChat,
	SESSION,
	session,
	step,
} from "./canon-fixtures";
import { fakeApi } from "./clients-fixtures";

/**
 * Canon chat's data layer: each new route's request as the contract has it,
 * the list's filters on the wire, the steps read after the last seq held,
 * and what each write and each landed turn reads again.
 */

const BASE = "http://avel.test";

function runPage(
	options: { queryFn?: unknown; queryKey: readonly unknown[] },
	pageParam?: string,
) {
	const fn = options.queryFn as (ctx: QueryFunctionContext) => Promise<unknown>;
	return fn({
		queryKey: options.queryKey,
		pageParam,
		signal: new AbortController().signal,
		meta: undefined,
	} as unknown as QueryFunctionContext);
}

/** Runs a mutation's options against a client that answers `answer`. */
async function mutate(
	build: (api: ReturnType<typeof fakeApi>["client"], qc: QueryClient) => object,
	variables: unknown,
	answer: { status: number; body: unknown },
) {
	const { client: api, calls } = fakeApi(() => answer);
	const qc = new QueryClient();
	await new MutationObserver<unknown, unknown, unknown>(
		qc,
		build(api, qc) as never,
	).mutate(variables);
	return { calls, qc };
}

const ok = (data: unknown, status = 200) => ({
	status,
	body: { success: true, data },
});

describe("opening a chat", () => {
	it("posts an open chat with its mode, and no Idempotency-Key", async () => {
		const { calls } = await mutate(
			createCanonSessionOptions,
			{ scope: "open", mode: "fetch" },
			ok(openChat({ mode: "fetch" }), 201),
		);
		expect(calls).toEqual([
			{
				method: "POST",
				path: `${BASE}/api/canon-sessions`,
				body: { scope: "open", mode: "fetch" },
			},
		]);
	});

	it("posts a client chat with its client", async () => {
		const { calls, qc } = await mutate(
			createCanonSessionOptions,
			{ scope: "client", clientId: CLIENT },
			ok(session({ intakeId: null, mode: "ask" }), 201),
		);
		expect(calls[0]?.body).toEqual({ scope: "client", clientId: CLIENT });
		// The answer shows at once, before the list is read again.
		expect(qc.getQueryData(queryKeys.canon.session(SESSION))).toMatchObject({
			scope: "client",
		});
	});
});

describe("the session's own writes", () => {
	it("renames with PATCH and a trimmed title", async () => {
		const { calls } = await mutate(
			updateCanonSessionOptions,
			{ id: SESSION, body: { title: "Booking flow" } },
			ok(session({ title: "Booking flow", titleSetBy: "operator" })),
		);
		expect(calls[0]).toEqual({
			method: "PATCH",
			path: `${BASE}/api/canon-sessions/${SESSION}`,
			body: { title: "Booking flow" },
		});
	});

	for (const [name, build, path] of [
		["reopen", reopenCanonSessionOptions, "reopen"],
		["archive", archiveCanonSessionOptions, "archive"],
		["unarchive", unarchiveCanonSessionOptions, "unarchive"],
	] as const) {
		it(`${name} posts to /${path} with no body`, async () => {
			const { calls } = await mutate(build, SESSION, ok(session()));
			expect(calls[0]?.method).toBe("POST");
			expect(calls[0]?.path).toBe(
				`${BASE}/api/canon-sessions/${SESSION}/${path}`,
			);
		});
	}
});

describe("sending a message", () => {
	it("sends the mode with it, under its attempt's key", async () => {
		const { calls } = await mutate(
			(api, qc) => postCanonMessageOptions(api, qc, SESSION),
			{ key: crypto.randomUUID(), body: { contentMd: "Hi", mode: "fetch" } },
			ok(message(1, { mode: "fetch" }), 202),
		);
		expect(calls[0]?.path).toBe(
			`${BASE}/api/canon-sessions/${SESSION}/messages`,
		);
		expect(calls[0]?.body).toEqual({ contentMd: "Hi", mode: "fetch" });
	});

	it("posts a new chat's first message into the session it names", async () => {
		const other = "00000000-0000-4000-8000-000000000799";
		const { calls } = await mutate(
			(api, qc) => postCanonMessageOptions(api, qc, null),
			{ key: crypto.randomUUID(), body: { contentMd: "Hi" }, sessionId: other },
			ok(message(1), 202),
		);
		expect(calls[0]?.path).toBe(`${BASE}/api/canon-sessions/${other}/messages`);
	});
});

describe("the chat list", () => {
	const page = {
		status: 200,
		body: {
			success: true,
			data: [chatItem()],
			meta: { nextCursor: null, total: 1 },
		},
	};

	it("asks for active chats by default, newest activity first, a page at a time", async () => {
		const { client: api, calls } = fakeApi(() => page);
		const options = canonChatsQuery(api, { archived: false });
		await runPage(options);
		const url = new URL(calls[0]?.path ?? "");
		expect(url.pathname).toBe("/api/canon-sessions");
		expect(url.searchParams.get("archived")).toBe("false");
		expect(url.searchParams.get("limit")).toBe(String(CANON_PAGE));
		expect(url.searchParams.has("q")).toBe(false);
		await runPage(options, "c2");
		expect(calls[1]?.path).toContain("cursor=c2");
	});

	it("sends the archived shelf, a trimmed search and the scope, each keyed apart", async () => {
		const { client: api, calls } = fakeApi(() => page);
		const options = canonChatsQuery(api, {
			archived: true,
			q: "  booking ",
			scope: "client",
			clientId: CLIENT,
		});
		await runPage(options);
		const url = new URL(calls[0]?.path ?? "");
		expect(url.searchParams.get("archived")).toBe("true");
		expect(url.searchParams.get("q")).toBe("booking");
		expect(url.searchParams.get("scope")).toBe("client");
		expect(url.searchParams.get("clientId")).toBe(CLIENT);
		expect(options.queryKey).not.toEqual(
			canonChatsQuery(api, { archived: false }).queryKey,
		);
		// Under the sessions' prefix, so any session write reads it again.
		expect(options.queryKey.slice(0, 2)).toEqual(queryKeys.canon.sessionsAll());
	});

	it("sends no search for blank text, and cuts a long one to the server's 200", () => {
		expect(canonSearchText("   ")).toBeUndefined();
		expect(canonSearchText("x".repeat(250))).toHaveLength(200);
	});
});

describe("the run trace's steps", () => {
	it("reads only what follows the last step held, 500 at most", async () => {
		const { client: api, calls } = fakeApi(() => ({
			status: 200,
			body: { success: true, data: [step(3)], meta: { lastSeq: 3 } },
		}));
		const qc = new QueryClient();
		qc.setQueryData(queryKeys.canon.steps(SESSION), [step(1), step(2)]);
		const steps = await qc.fetchQuery(canonStepsQuery(api, SESSION, qc));
		expect(calls).toHaveLength(1);
		const url = new URL(calls[0]?.path ?? "");
		expect(url.pathname).toBe(`/api/canon-sessions/${SESSION}/steps`);
		expect(url.searchParams.get("afterSeq")).toBe("2");
		expect(url.searchParams.get("limit")).toBe("500");
		expect(steps.map((s) => s.seq)).toEqual([1, 2, 3]);
	});

	it("polls about once a second", () => {
		expect(CANON_STEP_POLL_MS).toBe(1_000);
	});
});

function seeded(...keys: readonly (readonly unknown[])[]) {
	const qc = new QueryClient({
		defaultOptions: { queries: { staleTime: Number.POSITIVE_INFINITY } },
	});
	for (const key of keys) qc.setQueryData([...key], {});
	return qc;
}
const stale = (qc: QueryClient, key: readonly unknown[]) =>
	qc.getQueryState([...key])?.isInvalidated;

describe("refreshing after a session write", () => {
	it("reads every chat list, the intake's sessions, the intake and the log", async () => {
		const keys = [
			queryKeys.canon.chats({ archived: false }),
			queryKeys.canon.chats({ archived: true, q: "x" }),
			queryKeys.canon.sessions(INTAKE),
			queryKeys.intakes.detail(INTAKE),
			queryKeys.activity.all(),
		];
		const qc = seeded(...keys, queryKeys.canon.messages(SESSION));
		await afterCanonSessionWrite(qc, session());
		for (const key of keys) expect(stale(qc, key), String(key)).toBe(true);
		// A rename or an archive leaves the thread alone.
		expect(stale(qc, queryKeys.canon.messages(SESSION))).toBe(false);
	});

	it("reads no intake for an open chat", async () => {
		const qc = seeded(queryKeys.intakes.detail(INTAKE));
		await afterCanonSessionWrite(qc, openChat());
		expect(stale(qc, queryKeys.intakes.detail(INTAKE))).toBe(false);
	});
});

describe("a landed turn", () => {
	it("reads the steps again, and the chat lists (last activity, Canon's title)", async () => {
		const keys = [
			queryKeys.canon.steps(SESSION),
			queryKeys.canon.chats({ archived: false }),
		];
		const qc = seeded(...keys);
		await afterCanonMoved(
			qc,
			{ lastSeq: 2, openQuestions: 0 },
			openChat({ lastSeq: 3 }),
		);
		for (const key of keys) expect(stale(qc, key), String(key)).toBe(true);
	});
});

describe("reopening", () => {
	it("is open to a closed session or an operator halt, never a token-ceiling halt", () => {
		expect(
			canonReopenBlocked({ status: "closed", haltReason: null }),
		).toBeUndefined();
		expect(
			canonReopenBlocked({ status: "halted", haltReason: "operator" }),
		).toBeUndefined();
		expect(
			canonReopenBlocked({
				status: "halted",
				haltReason: "token_hard_ceiling",
			}),
		).toMatch(/hard token limit/);
		expect(canonReopenBlocked({ status: "open", haltReason: null })).toMatch(
			/already open/,
		);
	});
});
