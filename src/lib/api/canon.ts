import {
	infiniteQueryOptions,
	type QueryClient,
	queryOptions,
	useInfiniteQuery,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import {
	type CanonMessage,
	type CanonQuestion,
	type CanonSession,
	type ClientMemory,
	contract,
} from "avel-server/contract";
import { useEffect, useRef } from "react";
import type { z } from "zod";
import { type ApiClient, call, callPage } from "./client";
import { DISPATCH_POLL_MS } from "./dispatches";
import { queryKeys } from "./keys";
import { useApiClient } from "./provider";

/*
 * Canon, the project briefer, on one intake: a session with a chat, the
 * questions it asks through a stored pop-up, and the client's project memory
 * it proposes. Canon never approves or dispatches anything.
 *
 * Nothing is pushed. While Canon is answering (session.turn === "canon"),
 * the session alone is re-read every DISPATCH_POLL_MS; the messages and the
 * questions are re-read only when its lastSeq or openQuestions moves, so a
 * poll is one small read, not three.
 */

export const CANON_PAGE = 50;

// ---------------------------------------------------------------------------
// Sessions.

export function canonSessionsQuery(api: ApiClient, intakeId: string) {
	return infiniteQueryOptions({
		queryKey: queryKeys.canon.sessions(intakeId),
		queryFn: ({ pageParam }) =>
			callPage(contract.canon.listSessions, () =>
				api.canon.listSessions({
					params: { id: intakeId },
					query: {
						limit: CANON_PAGE,
						...(pageParam ? { cursor: pageParam } : {}),
					},
				}),
			),
		initialPageParam: undefined as string | undefined,
		getNextPageParam: (last) => last.meta.nextCursor ?? undefined,
	});
}

export function useCanonSessions(intakeId: string) {
	return useInfiniteQuery(canonSessionsQuery(useApiClient(), intakeId));
}

/** True while Canon owes a reply: the session re-reads itself until it lands. */
export function canonReplying(session: CanonSession | undefined): boolean {
	return session?.status === "open" && session.turn === "canon";
}

export function canonSessionQuery(api: ApiClient, sessionId: string) {
	return queryOptions({
		queryKey: queryKeys.canon.session(sessionId),
		queryFn: () =>
			call(contract.canon.getSession, () =>
				api.canon.getSession({ params: { id: sessionId } }),
			),
		refetchInterval: (query) =>
			canonReplying(query.state.data) ? DISPATCH_POLL_MS : false,
	});
}

type CanonMark = Pick<CanonSession, "lastSeq" | "openQuestions">;

/**
 * What a moved session reads again. A landed turn (lastSeq moved) brings new
 * messages, and Canon's tools may have written the intake (its brief, its
 * recommended roster) and the log; a moved openQuestions changes the
 * questions and the intake, whose approval waits on them.
 */
export function afterCanonMoved(
	queryClient: QueryClient,
	before: CanonMark,
	session: CanonSession,
) {
	const turn = session.lastSeq !== before.lastSeq;
	const questions = session.openQuestions !== before.openQuestions;
	if (!turn && !questions) return Promise.resolve();
	const { intakeId } = session;
	return Promise.all([
		turn
			? queryClient.invalidateQueries({
					queryKey: queryKeys.canon.messages(session.id),
				})
			: undefined,
		turn
			? queryClient.invalidateQueries({ queryKey: queryKeys.activity.all() })
			: undefined,
		// An open chat has no intake: nothing of one to read again.
		questions && intakeId
			? queryClient.invalidateQueries({
					queryKey: queryKeys.canon.questionsAll(intakeId),
				})
			: undefined,
		intakeId
			? queryClient.invalidateQueries({
					queryKey: queryKeys.intakes.detail(intakeId),
				})
			: undefined,
		// A turn is when Canon drafts the brief that titles the intake's row.
		turn && intakeId
			? queryClient.invalidateQueries({ queryKey: queryKeys.intakes.lists() })
			: undefined,
	]);
}

/**
 * One session, live: it polls while Canon is answering, and when its lastSeq
 * or openQuestions moves it re-reads the messages and the intake's questions.
 */
export function useCanonSession(sessionId: string | null) {
	const queryClient = useQueryClient();
	const query = useQuery({
		...canonSessionQuery(useApiClient(), sessionId ?? ""),
		enabled: sessionId !== null,
	});
	const seen = useRef<CanonMark | null>(null);
	const session = query.data;
	useEffect(() => {
		if (!session) return;
		const before = seen.current;
		seen.current = {
			lastSeq: session.lastSeq,
			openQuestions: session.openQuestions,
		};
		if (before) void afterCanonMoved(queryClient, before, session);
	}, [session, queryClient]);
	return query;
}

export type OpenCanonSessionBody = z.input<
	typeof contract.canon.openSession.body
>;

/** One open attempt: a resend with the same body replays instead of opening two. */
export type CanonAttempt<T> = { key: string; body: T };

export function canonAttemptFor<T>(
	last: CanonAttempt<T> | null,
	body: T,
	freshKey: () => string = () => crypto.randomUUID(),
): CanonAttempt<T> {
	return last && JSON.stringify(last.body) === JSON.stringify(body)
		? last
		: { key: freshKey(), body };
}

/** A session write changes the intake (openCanonSessionId) and the log. */
export function afterCanonSession(
	queryClient: QueryClient,
	intakeId: string,
	sessionId?: string,
) {
	return Promise.all([
		queryClient.invalidateQueries({
			queryKey: queryKeys.canon.sessions(intakeId),
		}),
		sessionId
			? queryClient.invalidateQueries({
					queryKey: queryKeys.canon.session(sessionId),
				})
			: Promise.resolve(),
		queryClient.invalidateQueries({
			queryKey: queryKeys.intakes.detail(intakeId),
		}),
		// An intake's row is titled by the brief Canon drafts (audit F2).
		queryClient.invalidateQueries({ queryKey: queryKeys.intakes.lists() }),
		queryClient.invalidateQueries({ queryKey: queryKeys.activity.all() }),
	]);
}

export function useOpenCanonSession(intakeId: string) {
	const api = useApiClient();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ key, body }: CanonAttempt<OpenCanonSessionBody>) =>
			call(contract.canon.openSession, () =>
				api.canon.openSession({
					params: { id: intakeId },
					headers: { "idempotency-key": key },
					body,
				}),
			),
		onSuccess: (session) => {
			queryClient.setQueryData(queryKeys.canon.session(session.id), session);
			return afterCanonSession(queryClient, intakeId, session.id);
		},
	});
}

export function useCloseCanonSession(intakeId: string) {
	const api = useApiClient();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (sessionId: string) =>
			call(contract.canon.closeSession, () =>
				api.canon.closeSession({ params: { id: sessionId } }),
			),
		onSuccess: (session) =>
			afterCanonSession(queryClient, intakeId, session.id),
	});
}

export function useHaltCanonSession(intakeId: string) {
	const api = useApiClient();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (sessionId: string) =>
			call(contract.canon.haltSession, () =>
				api.canon.haltSession({ params: { id: sessionId } }),
			),
		onSuccess: (session) =>
			afterCanonSession(queryClient, intakeId, session.id),
	});
}

// ---------------------------------------------------------------------------
// Messages: read whole from seq 0, then only what follows the last seq held.

export function canonMessagesQuery(
	api: ApiClient,
	sessionId: string,
	queryClient?: QueryClient,
) {
	const queryKey = queryKeys.canon.messages(sessionId);
	return queryOptions({
		queryKey,
		queryFn: async (): Promise<CanonMessage[]> => {
			// Messages only append, in seq order, so a re-read starts after the
			// last one held instead of downloading the thread again each turn.
			const held = queryClient?.getQueryData<CanonMessage[]>(queryKey) ?? [];
			const messages: CanonMessage[] = [...held];
			let afterSeq = held.at(-1)?.seq ?? 0;
			// 200 a page; a session ends far before this many pages.
			for (let i = 0; i < 50; i++) {
				const page = await callPage(contract.canon.listMessages, () =>
					api.canon.listMessages({
						params: { id: sessionId },
						query: { afterSeq, limit: 200 },
					}),
				);
				messages.push(...page.data);
				const last = page.data.at(-1)?.seq ?? afterSeq;
				if (page.data.length === 0 || last >= page.meta.lastSeq) break;
				afterSeq = last;
			}
			return messages;
		},
	});
}

export function useCanonMessages(sessionId: string | null) {
	return useQuery({
		...canonMessagesQuery(useApiClient(), sessionId ?? "", useQueryClient()),
		enabled: sessionId !== null,
	});
}

/** The most a message holds, as the server checks it. */
export const CANON_MESSAGE_MAX = 20_000;

export function usePostCanonMessage(sessionId: string) {
	const api = useApiClient();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ key, body }: CanonAttempt<{ contentMd: string }>) =>
			call(contract.canon.postMessage, () =>
				api.canon.postMessage({
					params: { id: sessionId },
					headers: { "idempotency-key": key },
					body,
				}),
			),
		onSuccess: (message) => afterCanonPost(queryClient, sessionId, message),
	});
}

/** The operator's message shows at once; Canon's reply comes by poll. */
export function afterCanonPost(
	queryClient: QueryClient,
	sessionId: string,
	message: CanonMessage,
) {
	queryClient.setQueryData<CanonMessage[]>(
		queryKeys.canon.messages(sessionId),
		(list) =>
			list && !list.some((m) => m.id === message.id)
				? [...list, message]
				: list,
	);
	// The post moves the session (its lastSeq): its detail and the intake's
	// session list read again (audit F2).
	return queryClient.invalidateQueries({
		queryKey: queryKeys.canon.sessionsAll(),
	});
}

// ---------------------------------------------------------------------------
// Questions: the stored pop-up.

type QuestionStatus = CanonQuestion["status"];

export function canonQuestionsQuery(
	api: ApiClient,
	intakeId: string,
	status?: QuestionStatus,
) {
	return infiniteQueryOptions({
		queryKey: queryKeys.canon.questions(intakeId, status),
		queryFn: ({ pageParam }) =>
			callPage(contract.canon.listQuestions, () =>
				api.canon.listQuestions({
					params: { id: intakeId },
					query: {
						limit: CANON_PAGE,
						...(status ? { status } : {}),
						...(pageParam ? { cursor: pageParam } : {}),
					},
				}),
			),
		initialPageParam: undefined as string | undefined,
		getNextPageParam: (last) => last.meta.nextCursor ?? undefined,
	});
}

export function useCanonQuestions(intakeId: string, status?: QuestionStatus) {
	return useInfiniteQuery(
		canonQuestionsQuery(useApiClient(), intakeId, status),
	);
}

/**
 * Settling a question changes the intake's questions, its sessions'
 * openQuestions, the intake itself (approval waits on open questions) and
 * the log.
 */
export function afterQuestion(queryClient: QueryClient, intakeId: string) {
	return Promise.all([
		queryClient.invalidateQueries({
			queryKey: queryKeys.canon.questionsAll(intakeId),
		}),
		queryClient.invalidateQueries({
			queryKey: queryKeys.canon.sessionsAll(),
		}),
		queryClient.invalidateQueries({
			queryKey: queryKeys.intakes.detail(intakeId),
		}),
		// An intake's row is titled by the brief Canon drafts (audit F2).
		queryClient.invalidateQueries({ queryKey: queryKeys.intakes.lists() }),
		queryClient.invalidateQueries({ queryKey: queryKeys.activity.all() }),
	]);
}

type AnswerBody = z.input<typeof contract.canon.answerQuestion.body>;
type DecideBody = z.input<typeof contract.canon.acknowledgeQuestion.body>;

export function useAnswerCanonQuestion(intakeId: string) {
	const api = useApiClient();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ id, body }: { id: string; body: AnswerBody }) =>
			call(contract.canon.answerQuestion, () =>
				api.canon.answerQuestion({ params: { id }, body }),
			),
		onSuccess: () => afterQuestion(queryClient, intakeId),
	});
}

export function useAcknowledgeCanonQuestion(intakeId: string) {
	const api = useApiClient();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ id, body = {} }: { id: string; body?: DecideBody }) =>
			call(contract.canon.acknowledgeQuestion, () =>
				api.canon.acknowledgeQuestion({ params: { id }, body }),
			),
		onSuccess: () => afterQuestion(queryClient, intakeId),
	});
}

export function useDismissCanonQuestion(intakeId: string) {
	const api = useApiClient();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ id, body = {} }: { id: string; body?: DecideBody }) =>
			call(contract.canon.dismissQuestion, () =>
				api.canon.dismissQuestion({ params: { id }, body }),
			),
		onSuccess: () => afterQuestion(queryClient, intakeId),
	});
}

// ---------------------------------------------------------------------------
// Client memory: one client's project memory, proposed by Canon or written.

type MemoryStatus = ClientMemory["status"];

export function clientMemoryQuery(
	api: ApiClient,
	clientId: string,
	status?: MemoryStatus,
) {
	return infiniteQueryOptions({
		queryKey: queryKeys.canon.memory(clientId, status),
		queryFn: ({ pageParam }) =>
			callPage(contract.canon.listMemory, () =>
				api.canon.listMemory({
					params: { id: clientId },
					query: {
						limit: CANON_PAGE,
						...(status ? { status } : {}),
						...(pageParam ? { cursor: pageParam } : {}),
					},
				}),
			),
		initialPageParam: undefined as string | undefined,
		getNextPageParam: (last) => last.meta.nextCursor ?? undefined,
	});
}

export function useClientMemory(clientId: string, status?: MemoryStatus) {
	return useInfiniteQuery(clientMemoryQuery(useApiClient(), clientId, status));
}

/** A memory write changes the client's memory lists and the log. */
export function afterMemory(queryClient: QueryClient, clientId: string) {
	return Promise.all([
		queryClient.invalidateQueries({
			queryKey: queryKeys.canon.memoryAll(clientId),
		}),
		queryClient.invalidateQueries({ queryKey: queryKeys.activity.all() }),
	]);
}

function memoryWrite<TArgs>(
	clientId: string,
	run: (api: ApiClient, args: TArgs) => Promise<ClientMemory>,
) {
	return function useMemoryWrite() {
		const api = useApiClient();
		const queryClient = useQueryClient();
		return useMutation({
			mutationFn: (args: TArgs) => run(api, args),
			onSuccess: () => afterMemory(queryClient, clientId),
		});
	};
}

export function useWriteClientMemory(clientId: string) {
	return memoryWrite(clientId, (api, contentMd: string) =>
		call(contract.canon.writeMemory, () =>
			api.canon.writeMemory({ params: { id: clientId }, body: { contentMd } }),
		),
	)();
}

export function useKeepClientMemory(clientId: string) {
	return memoryWrite(clientId, (api, id: string) =>
		call(contract.canon.keepMemory, () =>
			api.canon.keepMemory({ params: { id } }),
		),
	)();
}

export function useRemoveClientMemory(clientId: string) {
	return memoryWrite(clientId, (api, id: string) =>
		call(contract.canon.removeMemory, () =>
			api.canon.removeMemory({ params: { id } }),
		),
	)();
}

export function useEditClientMemory(clientId: string) {
	return memoryWrite(
		clientId,
		(api, { id, contentMd }: { id: string; contentMd: string }) =>
			call(contract.canon.editMemory, () =>
				api.canon.editMemory({ params: { id }, body: { contentMd } }),
			),
	)();
}
