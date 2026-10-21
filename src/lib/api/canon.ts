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
	type RunStep,
} from "avel-server/contract";
import { useEffect, useRef } from "react";
import type { z } from "zod";
import { type ApiClient, call, callPage } from "./client";
import { DISPATCH_POLL_MS } from "./dispatches";
import { queryKeys } from "./keys";
import { useApiClient } from "./provider";
import { readAfterSeq } from "./steps";

/*
 * Canon, the project briefer: a session with a chat (open on Home with no
 * client, or a client's, optionally on one intake), the questions it asks
 * through a stored pop-up, and the client's project memory it proposes.
 * Canon never approves or dispatches anything.
 *
 * Nothing is pushed. While Canon is answering (session.turn === "canon"),
 * the session alone is re-read every DISPATCH_POLL_MS and its run steps
 * every CANON_STEP_POLL_MS; the messages and the questions are re-read only
 * when its lastSeq or openQuestions moves.
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
		// The last steps can land after the last poll; the turn ends them.
		turn
			? queryClient.invalidateQueries({
					queryKey: queryKeys.canon.steps(session.id),
				})
			: undefined,
		// A turn moves the chat's last activity, and Canon may have named it.
		turn
			? queryClient.invalidateQueries({
					queryKey: queryKeys.canon.chatLists(),
				})
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

/**
 * A session write changes every session read (the intake's list, the chat
 * lists, the detail), the intake it briefs (openCanonSessionId) and the log.
 * An open chat has no intake.
 */
export function afterCanonSession(
	queryClient: QueryClient,
	intakeId: string | null,
) {
	return Promise.all([
		queryClient.invalidateQueries({
			queryKey: queryKeys.canon.sessionsAll(),
		}),
		intakeId
			? queryClient.invalidateQueries({
					queryKey: queryKeys.intakes.detail(intakeId),
				})
			: undefined,
		// An intake's row is titled by the brief Canon drafts (audit F2).
		intakeId
			? queryClient.invalidateQueries({ queryKey: queryKeys.intakes.lists() })
			: undefined,
		queryClient.invalidateQueries({ queryKey: queryKeys.activity.all() }),
	]);
}

/** The answer shows at once; every read of a session is read again. */
export function afterCanonSessionWrite(
	queryClient: QueryClient,
	session: CanonSession,
) {
	queryClient.setQueryData(queryKeys.canon.session(session.id), session);
	return afterCanonSession(queryClient, session.intakeId);
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
		onSuccess: (session) => afterCanonSessionWrite(queryClient, session),
	});
}

export function closeCanonSessionOptions(
	api: ApiClient,
	queryClient: QueryClient,
) {
	return {
		mutationFn: (sessionId: string) =>
			call(contract.canon.closeSession, () =>
				api.canon.closeSession({ params: { id: sessionId } }),
			),
		onSuccess: (session: CanonSession) =>
			afterCanonSessionWrite(queryClient, session),
	};
}

export function useCloseCanonSession() {
	return useMutation(
		closeCanonSessionOptions(useApiClient(), useQueryClient()),
	);
}

export function haltCanonSessionOptions(
	api: ApiClient,
	queryClient: QueryClient,
) {
	return {
		mutationFn: (sessionId: string) =>
			call(contract.canon.haltSession, () =>
				api.canon.haltSession({ params: { id: sessionId } }),
			),
		onSuccess: (session: CanonSession) =>
			afterCanonSessionWrite(queryClient, session),
	};
}

export function useHaltCanonSession() {
	return useMutation(haltCanonSessionOptions(useApiClient(), useQueryClient()));
}

// ---------------------------------------------------------------------------
// Chats: every session, open (Home, no client) and client, in one list.

export type CreateCanonSessionBody = z.input<
	typeof contract.canon.createSession.body
>;
export type UpdateCanonSessionBody = z.input<
	typeof contract.canon.updateSession.body
>;

/** The longest title, and search, the server takes. */
export const CANON_TITLE_MAX = 120;
export const CANON_SEARCH_MAX = 200;

/** What the chat list shows. archived false (the default) hides archived chats. */
export type CanonChatFilter = {
	archived: boolean;
	scope?: CanonSession["scope"];
	clientId?: string;
	status?: CanonSession["status"][];
	/** Matched against the title on the server. */
	q?: string;
};

/** The search to send, or undefined: the server answers 400 to an empty `q`. */
export function canonSearchText(text: string | undefined): string | undefined {
	const trimmed = (text ?? "").trim().slice(0, CANON_SEARCH_MAX).trim();
	return trimmed === "" ? undefined : trimmed;
}

export function canonChatsQuery(api: ApiClient, filter: CanonChatFilter) {
	const q = canonSearchText(filter.q);
	const { archived, scope, clientId, status } = filter;
	return infiniteQueryOptions({
		queryKey: queryKeys.canon.chats({ ...filter, q }),
		queryFn: ({ pageParam }) =>
			callPage(contract.canon.listAllSessions, () =>
				api.canon.listAllSessions({
					query: {
						limit: CANON_PAGE,
						archived: archived ? "true" : "false",
						...(scope ? { scope } : {}),
						...(clientId ? { clientId } : {}),
						...(status && status.length > 0 ? { status } : {}),
						...(q ? { q } : {}),
						...(pageParam ? { cursor: pageParam } : {}),
					},
				}),
			),
		initialPageParam: undefined as string | undefined,
		getNextPageParam: (last) => last.meta.nextCursor ?? undefined,
	});
}

export function useCanonChats(filter: CanonChatFilter) {
	return useInfiniteQuery(canonChatsQuery(useApiClient(), filter));
}

/**
 * A new session: open scope (no client, ask or fetch) or a client's. No
 * Idempotency-Key on this route, so a resend opens a second chat; the
 * caller keeps the one it made (see CanonChatStart).
 */
export function createCanonSessionOptions(
	api: ApiClient,
	queryClient: QueryClient,
) {
	return {
		mutationFn: (body: CreateCanonSessionBody) =>
			call(contract.canon.createSession, () =>
				api.canon.createSession({ body }),
			),
		onSuccess: (session: CanonSession) =>
			afterCanonSessionWrite(queryClient, session),
	};
}

export function useCreateCanonSession() {
	return useMutation(
		createCanonSessionOptions(useApiClient(), useQueryClient()),
	);
}

/** Rename (the operator's title, which Canon never renames), or change the default mode. */
export function updateCanonSessionOptions(
	api: ApiClient,
	queryClient: QueryClient,
) {
	return {
		mutationFn: ({ id, body }: { id: string; body: UpdateCanonSessionBody }) =>
			call(contract.canon.updateSession, () =>
				api.canon.updateSession({ params: { id }, body }),
			),
		onSuccess: (session: CanonSession) =>
			afterCanonSessionWrite(queryClient, session),
	};
}

export function useUpdateCanonSession() {
	return useMutation(
		updateCanonSessionOptions(useApiClient(), useQueryClient()),
	);
}

export function reopenCanonSessionOptions(
	api: ApiClient,
	queryClient: QueryClient,
) {
	return {
		mutationFn: (sessionId: string) =>
			call(contract.canon.reopenSession, () =>
				api.canon.reopenSession({ params: { id: sessionId } }),
			),
		onSuccess: (session: CanonSession) =>
			afterCanonSessionWrite(queryClient, session),
	};
}

export function useReopenCanonSession() {
	return useMutation(
		reopenCanonSessionOptions(useApiClient(), useQueryClient()),
	);
}

export function archiveCanonSessionOptions(
	api: ApiClient,
	queryClient: QueryClient,
) {
	return {
		mutationFn: (sessionId: string) =>
			call(contract.canon.archiveSession, () =>
				api.canon.archiveSession({ params: { id: sessionId } }),
			),
		onSuccess: (session: CanonSession) =>
			afterCanonSessionWrite(queryClient, session),
	};
}

export function useArchiveCanonSession() {
	return useMutation(
		archiveCanonSessionOptions(useApiClient(), useQueryClient()),
	);
}

export function unarchiveCanonSessionOptions(
	api: ApiClient,
	queryClient: QueryClient,
) {
	return {
		mutationFn: (sessionId: string) =>
			call(contract.canon.unarchiveSession, () =>
				api.canon.unarchiveSession({ params: { id: sessionId } }),
			),
		onSuccess: (session: CanonSession) =>
			afterCanonSessionWrite(queryClient, session),
	};
}

export function useUnarchiveCanonSession() {
	return useMutation(
		unarchiveCanonSessionOptions(useApiClient(), useQueryClient()),
	);
}

/**
 * Why a session can't be reopened, or undefined when it can: only a closed
 * session, or one the operator halted, comes back. A token-ceiling halt is
 * final (canon_session_final).
 */
export function canonReopenBlocked(
	session: Pick<CanonSession, "status" | "haltReason">,
): string | undefined {
	if (session.status === "open") return "This chat is already open.";
	if (
		session.status === "halted" &&
		session.haltReason === "token_hard_ceiling"
	)
		return "It reached its hard token limit, so it can't be reopened. Start a new chat.";
	return undefined;
}

// ---------------------------------------------------------------------------
// Messages and steps: read whole from seq 0, then only what follows the
// last seq held.

export function canonMessagesQuery(
	api: ApiClient,
	sessionId: string,
	queryClient?: QueryClient,
) {
	const queryKey = queryKeys.canon.messages(sessionId);
	return queryOptions({
		queryKey,
		queryFn: (): Promise<CanonMessage[]> =>
			readAfterSeq(
				queryClient?.getQueryData<CanonMessage[]>(queryKey) ?? [],
				(afterSeq) =>
					callPage(contract.canon.listMessages, () =>
						api.canon.listMessages({
							params: { id: sessionId },
							query: { afterSeq, limit: 200 },
						}),
					),
			),
	});
}

/** How often the steps are read while Canon is answering: the trace is live. */
export const CANON_STEP_POLL_MS = 1_000;

/**
 * The run trace: the steps Canon's turns take, read after the last seq
 * held, as messages are. One small read a second while a turn runs.
 */
export function canonStepsQuery(
	api: ApiClient,
	sessionId: string,
	queryClient?: QueryClient,
) {
	const queryKey = queryKeys.canon.steps(sessionId);
	return queryOptions({
		queryKey,
		queryFn: (): Promise<RunStep[]> =>
			readAfterSeq(
				queryClient?.getQueryData<RunStep[]>(queryKey) ?? [],
				(afterSeq) =>
					callPage(contract.canon.listSteps, () =>
						api.canon.listSteps({
							params: { id: sessionId },
							query: { afterSeq, limit: 500 },
						}),
					),
			),
	});
}

/** A session's steps; `live` (Canon is answering) polls them every second. */
export function useCanonSteps(sessionId: string | null, live: boolean) {
	return useQuery({
		...canonStepsQuery(useApiClient(), sessionId ?? "", useQueryClient()),
		enabled: sessionId !== null,
		refetchInterval: live ? CANON_STEP_POLL_MS : false,
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

/** The message and the mode it is sent in; mode defaults to the session's. */
export type PostCanonMessageBody = z.input<
	typeof contract.canon.postMessage.body
>;

/**
 * One message to one session. `sessionId` in the attempt names a session
 * made after the hook mounted (a new chat's first message).
 */
export type CanonPost = CanonAttempt<PostCanonMessageBody> & {
	sessionId?: string;
};

export function postCanonMessageOptions(
	api: ApiClient,
	queryClient: QueryClient,
	sessionId: string | null,
) {
	const target = (post: CanonPost) => post.sessionId ?? sessionId ?? "";
	return {
		mutationFn: (post: CanonPost) =>
			call(contract.canon.postMessage, () =>
				api.canon.postMessage({
					params: { id: target(post) },
					headers: { "idempotency-key": post.key },
					body: post.body,
				}),
			),
		onSuccess: (message: CanonMessage, post: CanonPost) =>
			afterCanonPost(queryClient, target(post), message),
	};
}

export function usePostCanonMessage(sessionId: string | null) {
	return useMutation(
		postCanonMessageOptions(useApiClient(), useQueryClient(), sessionId),
	);
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
