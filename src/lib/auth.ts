import {
	type QueryClient,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import {
	createContext,
	createElement,
	type ReactNode,
	useContext,
} from "react";
import { z } from "zod";
import { ApiError } from "@/lib/api/errors";

/**
 * The operator's session, from avel-server's Better Auth endpoints under
 * /api/auth/*. Those are not contract routes (avel-server's src/auth), so they
 * are called with plain fetch here, never through ts-rest. Requests go to the
 * app's own origin, and the app proxies /api to avel-server, so the session
 * cookie is first-party.
 *
 * The session lives in TanStack Query, beside every other query, so one
 * handler (`handleAuthFailure`) can invalidate it when any request comes back
 * 401, and signing out clears one cache.
 *
 * Server rendering cannot carry the browser's cookie here, so the session is
 * only fetched in the browser. The server renders the neutral checking
 * screen, never the shell, so nothing protected is ever in the first paint.
 */

/** The session's query keys, kept here (not in api/keys.ts) on purpose. */
export const SESSION_KEY = ["auth", "session"] as const;
/** Set when a request is refused with NOT_OPERATOR: signed in, no longer an operator. */
export const REFUSED_KEY = ["auth", "refused"] as const;

/**
 * The fields of Better Auth's session user this app reads. githubLogin is
 * one of avel-server's additional user fields (src/auth/index.ts).
 */
const sessionUser = z.object({
	id: z.string(),
	name: z.string(),
	email: z.string(),
	image: z.string().nullish(),
	githubLogin: z.string(),
});
export type SessionUser = z.infer<typeof sessionUser>;

/** get-session answers the session and its user, or null when signed out. */
const getSessionResponse = z
	.object({ session: z.object({ id: z.string() }), user: sessionUser })
	.nullable();

/** avel-server did not answer, so whether anyone is signed in is unknown. */
export class SessionUnavailable extends Error {
	constructor(options?: { cause?: unknown }) {
		super("avel-server did not answer the session check", options);
		this.name = "SessionUnavailable";
	}
}

/**
 * Where sessions come from. The app uses `httpSessionSource`. A test passes
 * its own, and can give `initial` so the first render is already decided.
 */
export type SessionSource = {
	fetchSession: () => Promise<SessionUser | null>;
	/** Starts GitHub sign-in. On success it leaves the page. */
	signIn: (urls: {
		callbackURL: string;
		errorCallbackURL: string;
	}) => Promise<void>;
	signOut: () => Promise<void>;
	/** A session known before rendering: a test's. Undefined in the app. */
	initial?: SessionUser | null;
};

async function postJson(path: string, body: unknown): Promise<Response> {
	const res = await fetch(path, {
		method: "POST",
		credentials: "same-origin",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	});
	if (!res.ok) throw new Error(`${path} answered ${res.status}`);
	return res;
}

export const httpSessionSource: SessionSource = {
	async fetchSession() {
		let res: Response;
		try {
			res = await fetch("/api/auth/get-session", {
				credentials: "same-origin",
				headers: { accept: "application/json" },
			});
		} catch (cause) {
			throw new SessionUnavailable({ cause });
		}
		// The proxy answers 502 when avel-server is down; any 5xx means the
		// server could not say who is signed in.
		if (res.status >= 500) throw new SessionUnavailable();
		if (!res.ok) throw new Error(`get-session answered ${res.status}`);
		const parsed = getSessionResponse.parse(await res.json());
		return parsed?.user ?? null;
	},
	async signIn({ callbackURL, errorCallbackURL }) {
		const res = await postJson("/api/auth/sign-in/social", {
			provider: "github",
			callbackURL,
			errorCallbackURL,
			// The URL comes back in the body; this page navigates to it.
			disableRedirect: true,
		});
		const { url } = z.object({ url: z.string().url() }).parse(await res.json());
		window.location.assign(url);
	},
	async signOut() {
		await postJson("/api/auth/sign-out", {});
	},
};

const SessionSourceContext = createContext<SessionSource>(httpSessionSource);

/** Replaces where sessions come from, for everything below it. */
export function SessionSourceProvider({
	source,
	children,
}: {
	source: SessionSource;
	children?: ReactNode;
}) {
	return createElement(
		SessionSourceContext.Provider,
		{ value: source },
		children,
	);
}

export function useSessionSource(): SessionSource {
	return useContext(SessionSourceContext);
}

/** What the gate decides on. */
export type SessionState =
	| { status: "checking" }
	| { status: "unreachable"; retry: () => void; retrying: boolean }
	| { status: "signed-out" }
	| { status: "signed-in"; user: SessionUser; refused: boolean };

export function useSessionState(): SessionState {
	const source = useSessionSource();
	const known = source.initial !== undefined;
	const session = useQuery({
		queryKey: SESSION_KEY,
		queryFn: source.fetchSession,
		// Only in the browser, where the cookie is; or at once when a test
		// supplied the answer.
		enabled: known || typeof window !== "undefined",
		...(known ? { initialData: source.initial } : {}),
		retry: false,
		staleTime: 60_000,
	});
	const refused = useQuery({
		queryKey: REFUSED_KEY,
		queryFn: () => false,
		initialData: false,
		enabled: false,
	});

	if (session.status === "pending") return { status: "checking" };
	if (session.status === "error") {
		return {
			status: "unreachable",
			retry: () => {
				session.refetch();
			},
			retrying: session.isFetching,
		};
	}
	if (session.data === null) return { status: "signed-out" };
	return {
		status: "signed-in",
		user: session.data,
		refused: refused.data,
	};
}

/**
 * Called for every failed query and mutation (src/lib/api/provider.tsx).
 * UNAUTHENTICATED means the session ended: re-check it, so the gate returns.
 * NOT_OPERATOR means a live session whose account was taken off the operator
 * allowlist: mark it, so the gate says so. Switched on the code, never the
 * status: FORBIDDEN is also a 403, for a per-resource denial, and belongs to
 * the page's own error state.
 */
export function handleAuthFailure(client: QueryClient, error: unknown): void {
	if (!(error instanceof ApiError) || error.failure.kind !== "contract") return;
	if (error.failure.code === "UNAUTHENTICATED") {
		client.invalidateQueries({ queryKey: SESSION_KEY });
	} else if (error.failure.code === "NOT_OPERATOR") {
		client.setQueryData(REFUSED_KEY, true);
	}
}

/**
 * Signs out and forgets everything fetched as this operator. The session is
 * set to signed out directly, so the gate shows at once.
 */
export function useSignOut(): () => Promise<void> {
	const source = useSessionSource();
	const client = useQueryClient();
	return () => signOutAndForget(client, source);
}

export async function signOutAndForget(
	client: QueryClient,
	source: Pick<SessionSource, "signOut">,
): Promise<void> {
	await source.signOut();
	client.removeQueries({
		predicate: (query) => query.queryKey[0] !== SESSION_KEY[0],
	});
	client.setQueryData(REFUSED_KEY, false);
	client.setQueryData(SESSION_KEY, null);
}

/**
 * Where GitHub sign-in returns. Success comes back to the page asked for.
 * A refusal always comes back to "/", because a route that validates its
 * search (Missions) would redirect away Better Auth's `?error=` first.
 */
export function signInUrls(currentHref: string): {
	callbackURL: string;
	errorCallbackURL: string;
} {
	return { callbackURL: currentHref, errorCallbackURL: "/" };
}

/**
 * Better Auth's error codes on a refused sign-in redirect (`?error=`) that
 * mean the account is not on the operator allowlist: avel-server's database
 * hooks refuse the user row or the session (src/auth/index.ts).
 */
export const NOT_ALLOWED_ERRORS = [
	"unable_to_create_user",
	"unable_to_create_session",
] as const;
