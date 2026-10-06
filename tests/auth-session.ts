import type { SessionSource, SessionUser } from "../src/lib/auth";

/**
 * Sessions for tests. Not collected as a test file: vitest collects only
 * *.test.ts(x). A test renders the app inside <SessionSourceProvider> with one
 * of these, so the sign-in gate is decided before the first render, the way
 * the browser's session check decides it after hydration.
 */

/** A signed-in operator. Tests assert on these exact values. */
export const TEST_OPERATOR: SessionUser = {
	id: "00000000-0000-4000-8000-000000000001",
	name: "Ada Lovelace",
	email: "ada@example.com",
	image: null,
	githubLogin: "ada",
};

type Calls = { signIn: unknown[]; signOut: number; fetchSession: number };

/** A source whose session is `initial`, recording what the app asked of it. */
export function sessionSource(
	initial: SessionUser | null | undefined,
	overrides: Partial<SessionSource> = {},
): SessionSource & { calls: Calls } {
	const calls: Calls = { signIn: [], signOut: 0, fetchSession: 0 };
	return {
		calls,
		initial,
		fetchSession: async () => {
			calls.fetchSession += 1;
			return initial ?? null;
		},
		signIn: async (urls) => {
			calls.signIn.push(urls);
		},
		signOut: async () => {
			calls.signOut += 1;
		},
		...overrides,
	};
}

/** Signed in as TEST_OPERATOR. */
export const signedIn = () => sessionSource(TEST_OPERATOR);
