import { useLocation } from "@tanstack/react-router";
import { createContext, type ReactNode, useContext } from "react";
import {
	NOT_ALLOWED_ERRORS,
	type SessionState,
	type SessionUser,
	signInUrls,
	useSessionSource,
	useSessionState,
	useSignOut,
} from "@/lib/auth";
import {
	CheckingScreen,
	NotAllowedScreen,
	SignInScreen,
	UnreachableScreen,
} from "./auth-screens";

/** The signed-in operator, for anything inside the gate. */
export type SignedIn = { user: SessionUser; signOut: () => Promise<void> };

const SignedInContext = createContext<SignedIn | null>(null);

/** The gate's context, for rendering one component as signed in, in a test. */
export const SignedInProvider = SignedInContext.Provider;

export function useSignedIn(): SignedIn {
	const signedIn = useContext(SignedInContext);
	if (!signedIn) throw new Error("useSignedIn must be used inside <AuthGate>");
	return signedIn;
}

/**
 * The sign-in gate (DAY-ONE-FRONTEND.md: unauthenticated is rejected hard,
 * not redirected softly). Until the session is known it shows only the mark;
 * signed out, the sign-in screen; not an operator, a refusal; avel-server
 * down, a screen saying so. The shell, and every page in it, renders only for
 * a signed-in operator. avel-server enforces the same on every request; this
 * decides only what is drawn.
 *
 * /dev/ pages pass through in development, bare when no one is signed in:
 * they are tools, not data, and 404 in production builds.
 */
export function AuthGate({
	children,
	bare,
}: {
	children: ReactNode;
	/**
	 * A /dev/ page on its own, without the shell. The shell names the
	 * operator, so with no session a dev page renders bare instead.
	 */
	bare: ReactNode;
}) {
	const state = useSessionState();
	const location = useLocation();
	const source = useSessionSource();
	const signOut = useSignOut();

	if (
		import.meta.env.DEV &&
		location.pathname.startsWith("/dev/") &&
		!(state.status === "signed-in" && !state.refused)
	) {
		return bare;
	}

	const signIn = () => source.signIn(signInUrls(location.href));
	const error = (location.search as Record<string, unknown>).error;

	return (
		<GateView
			state={state}
			error={typeof error === "string" ? error : undefined}
			onSignIn={signIn}
			onSignOut={signOut}
		>
			{children}
		</GateView>
	);
}

/**
 * What the gate draws for a session state. Separate from AuthGate so every
 * state can be rendered and tested without a server.
 */
export function GateView({
	state,
	error,
	onSignIn,
	onSignOut,
	children,
}: {
	state: SessionState;
	/** Better Auth's `?error=` code from a failed sign-in, if any. */
	error?: string;
	onSignIn: () => Promise<void>;
	onSignOut: () => Promise<void>;
	children: ReactNode;
}) {
	switch (state.status) {
		case "checking":
			return <CheckingScreen />;
		case "unreachable":
			return (
				<UnreachableScreen onRetry={state.retry} retrying={state.retrying} />
			);
		case "signed-out":
			if (error && (NOT_ALLOWED_ERRORS as readonly string[]).includes(error)) {
				return <NotAllowedScreen onTryAnother={onSignIn} />;
			}
			return (
				<SignInScreen
					onSignIn={onSignIn}
					notice={
						error
							? "Sign-in did not finish. Nothing was saved. Try again."
							: undefined
					}
				/>
			);
		case "signed-in":
			if (state.refused) {
				return <NotAllowedScreen account={state.user} onSignOut={onSignOut} />;
			}
			return (
				<SignedInContext.Provider
					value={{ user: state.user, signOut: onSignOut }}
				>
					{children}
				</SignedInContext.Provider>
			);
	}
}
