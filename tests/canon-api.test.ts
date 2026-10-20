import { QueryClient } from "@tanstack/react-query";
import type { CanonSession } from "avel-server/contract";
import { describe, expect, it, vi } from "vitest";
import {
	afterCanonMoved,
	afterCanonSession,
	afterMemory,
	afterQuestion,
	canonAttemptFor,
	canonMessagesQuery,
	canonReplying,
} from "@/lib/api/canon";
import type { ApiClient } from "@/lib/api/client";
import { queryKeys } from "@/lib/api/keys";

/**
 * Canon's data layer: it polls only while Canon owes a reply, a resend of
 * the same body replays, and each write refreshes what it changed.
 */

const INTAKE = "00000000-0000-4000-8000-000000000001";
const SESSION = "00000000-0000-4000-8000-000000000002";
const CLIENT = "00000000-0000-4000-8000-000000000003";

const session = (over: Partial<CanonSession>) =>
	({ status: "open", turn: "idle", ...over }) as CanonSession;

describe("polling", () => {
	it("runs only while an open session owes Canon's reply", () => {
		expect(canonReplying(session({ turn: "canon" }))).toBe(true);
		expect(canonReplying(session({ turn: "idle" }))).toBe(false);
		expect(canonReplying(session({ turn: "canon", status: "halted" }))).toBe(
			false,
		);
		expect(canonReplying(undefined)).toBe(false);
	});
});

describe("a Canon attempt", () => {
	it("keeps its key for the same body and takes a new one when it changes", () => {
		let n = 0;
		const fresh = () => `k${++n}`;
		const first = canonAttemptFor(null, { contentMd: "hi" }, fresh);
		expect(canonAttemptFor(first, { contentMd: "hi" }, fresh)).toBe(first);
		expect(canonAttemptFor(first, { contentMd: "hi there" }, fresh).key).toBe(
			"k2",
		);
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

describe("refreshing after a write", () => {
	it("a session write reads the intake's sessions, that session, the intake and the log", async () => {
		const keys = [
			queryKeys.canon.sessions(INTAKE),
			queryKeys.canon.session(SESSION),
			queryKeys.intakes.detail(INTAKE),
			queryKeys.activity.all(),
		];
		const qc = seeded(...keys);
		await afterCanonSession(qc, INTAKE, SESSION);
		for (const key of keys) expect(stale(qc, key), String(key)).toBe(true);
	});

	it("settling a question reads the questions, the sessions' open counts and the intake", async () => {
		const keys = [
			queryKeys.canon.questions(INTAKE, "open"),
			queryKeys.canon.questions(INTAKE),
			queryKeys.canon.session(SESSION),
			queryKeys.intakes.detail(INTAKE),
		];
		const qc = seeded(...keys, queryKeys.canon.messages(SESSION));
		await afterQuestion(qc, INTAKE);
		for (const key of keys) expect(stale(qc, key), String(key)).toBe(true);
		// The chat is untouched by a settled question.
		expect(stale(qc, queryKeys.canon.messages(SESSION))).toBe(false);
	});

	it("a memory write reads that client's memory lists only", async () => {
		const mine = queryKeys.canon.memory(CLIENT, "proposed");
		const other = queryKeys.canon.memory(
			"00000000-0000-4000-8000-000000000009",
		);
		const qc = seeded(mine, other);
		await afterMemory(qc, CLIENT);
		expect(stale(qc, mine)).toBe(true);
		expect(stale(qc, other)).toBe(false);
	});
});

describe("a session that moved", () => {
	const mark = { lastSeq: 4, openQuestions: 0 };
	const moved = (over: Partial<CanonSession>) =>
		({
			id: SESSION,
			intakeId: INTAKE,
			...mark,
			...over,
		}) as CanonSession;
	const keys = {
		messages: queryKeys.canon.messages(SESSION),
		questions: queryKeys.canon.questions(INTAKE),
		intake: queryKeys.intakes.detail(INTAKE),
		intakeRows: [...queryKeys.intakes.lists(), "by-engagement"],
		log: queryKeys.activity.all(),
	};
	const settle = async (session: CanonSession) => {
		const qc = seeded(...Object.values(keys));
		await afterCanonMoved(qc, mark, session);
		return (key: readonly unknown[]) => stale(qc, key);
	};

	it("a landed turn reads the messages, the intake Canon may have written and the log", async () => {
		const isStale = await settle(moved({ lastSeq: 6 }));
		expect(isStale(keys.messages)).toBe(true);
		expect(isStale(keys.intake)).toBe(true);
		expect(isStale(keys.log)).toBe(true);
		expect(isStale(keys.intakeRows)).toBe(true);
		expect(isStale(keys.questions)).toBe(false);
	});

	it("a new question reads the questions and the intake, whose approval waits on it", async () => {
		const isStale = await settle(moved({ openQuestions: 1 }));
		expect(isStale(keys.questions)).toBe(true);
		expect(isStale(keys.intake)).toBe(true);
		expect(isStale(keys.messages)).toBe(false);
		expect(isStale(keys.intakeRows)).toBe(false);
	});

	it("an unmoved poll reads nothing", async () => {
		const isStale = await settle(moved({}));
		for (const key of Object.values(keys)) expect(isStale(key)).toBe(false);
	});
});

describe("re-reading the thread", () => {
	it("asks only for what follows the last message held", async () => {
		const msg = (seq: number) => ({ id: `m${seq}`, seq });
		const listMessages = vi.fn(async () => ({
			status: 200,
			body: { data: [msg(3)], meta: { lastSeq: 3 } },
			headers: new Headers(),
		}));
		const api = { canon: { listMessages } } as unknown as ApiClient;
		const qc = new QueryClient();
		qc.setQueryData(queryKeys.canon.messages(SESSION), [msg(1), msg(2)]);
		const messages = await qc.fetchQuery(canonMessagesQuery(api, SESSION, qc));
		expect(listMessages).toHaveBeenCalledTimes(1);
		expect(listMessages).toHaveBeenCalledWith(
			expect.objectContaining({ query: { afterSeq: 2, limit: 200 } }),
		);
		expect(messages.map((m) => m.seq)).toEqual([1, 2, 3]);
	});
});
