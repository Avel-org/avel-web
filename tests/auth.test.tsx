import {
	createMemoryHistory,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, createAppQueryClient } from "@/lib/api";
import {
	httpSessionSource,
	REFUSED_KEY,
	SESSION_KEY,
	type SessionSource,
	SessionSourceProvider,
	type SessionState,
	SessionUnavailable,
	signInUrls,
	signOutAndForget,
} from "@/lib/auth";
import { routeTree } from "@/routeTree.gen";
import { GateView } from "@/shell/auth-gate";
import { sessionSource, TEST_OPERATOR } from "./auth-session";
import { tagOf } from "./render-page";

/** The real app at `path`, with sessions from `source`. */
async function app(path: string, source: SessionSource): Promise<string> {
	const router = createRouter({
		routeTree,
		history: createMemoryHistory({ initialEntries: [path] }),
	});
	await router.load();
	return renderToString(
		<SessionSourceProvider source={source}>
			<RouterProvider router={router} />
		</SessionSourceProvider>,
	);
}

/** What the gate draws for a state, with `children` standing in for the shell. */
function gate(state: SessionState, error?: string): string {
	return renderToString(
		<GateView
			state={state}
			error={error}
			onSignIn={async () => undefined}
			onSignOut={async () => undefined}
		>
			<div data-testid="the-shell" />
		</GateView>,
	);
}

/** Nothing of the shell or of a page is in this markup. */
function expectNoShell(html: string) {
	for (const id of [
		"app-shell",
		"sidebar",
		"topbar",
		"page",
		"missions-page",
	]) {
		expect(html).not.toContain(`data-testid="${id}"`);
	}
}

const contractError = (code: string) =>
	new ApiError({
		method: "GET",
		path: "/api/x",
		kind: "contract",
		status: code === "UNAUTHENTICATED" ? 401 : 403,
		// The codes below are all in the contract's union.
		code: code as "UNAUTHENTICATED",
		message: "for logs only",
		requestId: "req-1",
	});

describe("the gate, through the real app", () => {
	it("signed out: the sign-in screen and nothing of the shell", async () => {
		const html = await app("/missions", sessionSource(null));
		expectNoShell(html);
		expect(html).toContain('data-testid="auth-sign-in"');
		expect(html).toContain('data-testid="brand-mark"');
		expect(html).toMatch(/<h1[^>]*>Sign in to AVEL<\/h1>/);
		expect(html).toContain(
			"AVEL runs AI agents on real client work and refuses to ship anything it cannot prove.",
		);
		expect(html).toMatch(
			/data-testid="auth-sign-in-github"[^>]*>.*Continue with GitHub/s,
		);
	});

	it("session unknown: only the mark, marked busy, never the shell", async () => {
		const source = sessionSource(undefined);
		const html = await app("/missions", source);
		expectNoShell(html);
		expect(tagOf(html, "auth-checking")).toContain('aria-busy="true"');
		expect(html).toContain("Checking your session");
		// The server never asks: it cannot carry the browser's cookie.
		expect(source.calls.fetchSession).toBe(0);
	});

	it("signed in: the shell, the page and the operator", async () => {
		const html = await app("/missions", sessionSource(TEST_OPERATOR));
		expect(html).toContain('data-testid="app-shell"');
		expect(html).toContain('data-testid="missions-page"');
		expect(html).toMatch(
			new RegExp(`data-testid="operator-name"[^>]*>${TEST_OPERATOR.name}<`),
		);
		expect(html).not.toContain('data-testid="auth-sign-in"');
	});

	it("a sign-in the allowlist refused: the not-allowed screen, naming no account", async () => {
		for (const error of ["unable_to_create_user", "unable_to_create_session"]) {
			const html = await app(`/?error=${error}`, sessionSource(null));
			expectNoShell(html);
			expect(html).toContain('data-testid="auth-not-allowed"');
			expect(html).toContain(
				"This GitHub account isn&#x27;t allowed into this Command Center",
			);
			expect(html).not.toContain('data-testid="auth-not-allowed-account"');
			expect(html).toContain('data-testid="auth-not-allowed-retry"');
		}
	});

	it("any other sign-in failure: the sign-in screen, saying it did not finish", async () => {
		const html = await app("/?error=state_mismatch", sessionSource(null));
		expect(html).toContain('data-testid="auth-sign-in"');
		expect(html).toMatch(
			/data-testid="auth-sign-in-notice"[^>]*>Sign-in did not finish/,
		);
	});

	it("lets /dev/ pages through in development, bare, without the shell", async () => {
		const html = await app("/dev/primitives", sessionSource(null));
		expect(html).toContain('data-testid="dev-bare"');
		expect(html).not.toContain('data-testid="auth-sign-in"');
		expect(html).not.toContain('data-testid="sidebar"');
	});
});

describe("every state the gate draws", () => {
	it("unreachable: says so, with Try again, and is not the sign-in screen", () => {
		const html = gate({
			status: "unreachable",
			retry: () => {},
			retrying: false,
		});
		expect(html).toContain('data-testid="auth-unreachable"');
		expect(html).toMatch(/<h1[^>]*>Can&#x27;t reach avel-server<\/h1>/);
		expect(tagOf(html, "auth-unreachable-retry")).not.toMatch(/\sdisabled=""/);
		expect(html).not.toContain("auth-sign-in");
		expect(html).not.toContain("the-shell");
	});

	it("unreachable while retrying: the button is disabled and says so", () => {
		const html = gate({
			status: "unreachable",
			retry: () => {},
			retrying: true,
		});
		expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Trying again<\/button>/);
	});

	it("signed in but no longer an operator: names the account, with Sign out", () => {
		const html = gate({
			status: "signed-in",
			user: TEST_OPERATOR,
			refused: true,
		});
		expect(html).toContain('data-testid="auth-not-allowed"');
		expect(html).toMatch(
			/data-testid="auth-not-allowed-account".*Ada Lovelace.*@<!-- -->ada/s,
		);
		expect(html).toContain('data-testid="auth-not-allowed-sign-out"');
		expect(html).not.toContain("the-shell");
	});

	it("signed in as an operator: the shell, nothing else", () => {
		const html = gate({
			status: "signed-in",
			user: TEST_OPERATOR,
			refused: false,
		});
		expect(html).toBe('<div data-testid="the-shell"></div>');
	});
});

describe("a failed request reaches the gate, wired once on the app's QueryClient", () => {
	async function failQuery(client = createAppQueryClient(), error: unknown) {
		client.setQueryData(SESSION_KEY, TEST_OPERATOR);
		await client
			.fetchQuery({
				queryKey: ["missions"],
				queryFn: () => Promise.reject(error),
			})
			.catch(() => undefined);
		return client;
	}

	it("UNAUTHENTICATED re-checks the session", async () => {
		const client = await failQuery(undefined, contractError("UNAUTHENTICATED"));
		expect(client.getQueryState(SESSION_KEY)?.isInvalidated).toBe(true);
		expect(client.getQueryData(REFUSED_KEY)).toBeUndefined();
	});

	it("NOT_OPERATOR marks the operator as refused", async () => {
		const client = await failQuery(undefined, contractError("NOT_OPERATOR"));
		expect(client.getQueryData(REFUSED_KEY)).toBe(true);
		expect(client.getQueryState(SESSION_KEY)?.isInvalidated).toBe(false);
	});

	it("FORBIDDEN does neither: a per-resource denial is the page's to show", async () => {
		const client = await failQuery(undefined, contractError("FORBIDDEN"));
		expect(client.getQueryData(REFUSED_KEY)).toBeUndefined();
		expect(client.getQueryState(SESSION_KEY)?.isInvalidated).toBe(false);
	});

	it("an error that is not from the contract does neither", async () => {
		const client = await failQuery(undefined, new Error("network"));
		expect(client.getQueryData(REFUSED_KEY)).toBeUndefined();
		expect(client.getQueryState(SESSION_KEY)?.isInvalidated).toBe(false);
	});

	it("a failed mutation is handled the same way", async () => {
		const client = createAppQueryClient();
		client.setQueryData(SESSION_KEY, TEST_OPERATOR);
		await client
			.getMutationCache()
			.build(client, {
				mutationFn: () => Promise.reject(contractError("UNAUTHENTICATED")),
			})
			.execute(undefined)
			.catch(() => undefined);
		expect(client.getQueryState(SESSION_KEY)?.isInvalidated).toBe(true);
	});
});

describe("signing in and out", () => {
	it("returns to the page asked for, and a refusal to /", () => {
		expect(signInUrls("/missions?status=failed")).toEqual({
			callbackURL: "/missions?status=failed",
			errorCallbackURL: "/",
		});
	});

	it("sign out ends the session and forgets everything fetched", async () => {
		const client = createAppQueryClient();
		client.setQueryData(SESSION_KEY, TEST_OPERATOR);
		client.setQueryData(REFUSED_KEY, true);
		client.setQueryData(["missions"], ["m1"]);
		const source = sessionSource(TEST_OPERATOR);
		await signOutAndForget(client, source);
		expect(source.calls.signOut).toBe(1);
		expect(client.getQueryData(["missions"])).toBeUndefined();
		expect(client.getQueryData(SESSION_KEY)).toBeNull();
		expect(client.getQueryData(REFUSED_KEY)).toBe(false);
	});

	it("a failed sign-out keeps the session: nothing is cleared", async () => {
		const client = createAppQueryClient();
		client.setQueryData(SESSION_KEY, TEST_OPERATOR);
		client.setQueryData(["missions"], ["m1"]);
		const failing = { signOut: () => Promise.reject(new Error("down")) };
		await expect(signOutAndForget(client, failing)).rejects.toThrow("down");
		expect(client.getQueryData(SESSION_KEY)).toEqual(TEST_OPERATOR);
		expect(client.getQueryData(["missions"])).toEqual(["m1"]);
	});
});

describe("the session over HTTP (Better Auth's endpoints)", () => {
	afterEach(() => vi.unstubAllGlobals());

	const answer = (status: number, body: unknown) =>
		vi.fn(async () => Response.json(body, { status }));
	const session = {
		session: { id: "s1" },
		user: { ...TEST_OPERATOR, emailVerified: true },
	};

	it("reads get-session on the app's own origin, with the cookie", async () => {
		const fetch = answer(200, session);
		vi.stubGlobal("fetch", fetch);
		expect(await httpSessionSource.fetchSession()).toEqual(TEST_OPERATOR);
		expect(fetch).toHaveBeenCalledWith(
			"/api/auth/get-session",
			expect.objectContaining({ credentials: "same-origin" }),
		);
	});

	it("reads a null session as signed out", async () => {
		vi.stubGlobal("fetch", answer(200, null));
		expect(await httpSessionSource.fetchSession()).toBeNull();
	});

	it("treats a refused connection or a 5xx as avel-server unreachable", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				throw new TypeError("fetch failed");
			}),
		);
		await expect(httpSessionSource.fetchSession()).rejects.toBeInstanceOf(
			SessionUnavailable,
		);
		vi.stubGlobal("fetch", answer(502, { message: "Bad Gateway" }));
		await expect(httpSessionSource.fetchSession()).rejects.toBeInstanceOf(
			SessionUnavailable,
		);
	});

	it("rejects a session missing the fields this app reads", async () => {
		const { githubLogin: _, ...user } = TEST_OPERATOR;
		vi.stubGlobal("fetch", answer(200, { session: { id: "s1" }, user }));
		const error = await httpSessionSource
			.fetchSession()
			.catch((e: unknown) => e);
		expect(error).toBeInstanceOf(Error);
		expect(error).not.toBeInstanceOf(SessionUnavailable);
	});

	it("starts GitHub sign-in and goes to the URL Better Auth returns", async () => {
		const fetch = answer(200, {
			url: "https://github.com/login/oauth/authorize?x=1",
			redirect: false,
		});
		const assign = vi.fn();
		vi.stubGlobal("fetch", fetch);
		vi.stubGlobal("window", { location: { assign } });
		await httpSessionSource.signIn(signInUrls("/missions"));
		const [path, init] = fetch.mock.calls[0] as unknown as [
			string,
			RequestInit,
		];
		expect(path).toBe("/api/auth/sign-in/social");
		expect(JSON.parse(String(init.body))).toEqual({
			provider: "github",
			callbackURL: "/missions",
			errorCallbackURL: "/",
			disableRedirect: true,
		});
		expect(assign).toHaveBeenCalledWith(
			"https://github.com/login/oauth/authorize?x=1",
		);
	});

	it("signs out with a POST to sign-out", async () => {
		const fetch = answer(200, { success: true });
		vi.stubGlobal("fetch", fetch);
		await httpSessionSource.signOut();
		expect(fetch).toHaveBeenCalledWith(
			"/api/auth/sign-out",
			expect.objectContaining({ method: "POST" }),
		);
	});
});
