import { useLocation } from "@tanstack/react-router";
import {
	createContext,
	type ReactNode,
	useContext,
	useEffect,
	useState,
} from "react";
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

/**
 * Development preview (operator request: the interface must be viewable
 * without a working sign-in). Offered only in `pnpm dev`, on the unreachable
 * screen and the sign-in screen, never on the not-allowed screen: it never
 * stands in for an operator avel-server has refused. It shows the interface
 * only; avel-server still refuses every data request without a session, and
 * pages say so. Remembered for the browser tab only.
 */
const PREVIEW_KEY = "avel.preview";
export const PREVIEW_USER: SessionUser = {
	id: "preview",
	// The Command Center has one user, its owner, and the preview stands in
	// for them. The login says it is a preview, so it is never taken for a
	// session.
	name: "Javaris Tavel",
	email: "",
	image: null,
	githubLogin: "javaris500, preview",
};

function usePreview(): [boolean, (on: boolean) => void] {
	const [on, setOn] = useState(false);
	useEffect(() => {
		if (!import.meta.env.DEV) return;
		try {
			setOn(window.sessionStorage.getItem(PREVIEW_KEY) === "1");
		} catch {
			// Storage unavailable: no preview to restore.
		}
	}, []);
	const set = (next: boolean) => {
		setOn(next);
		try {
			if (next) window.sessionStorage.setItem(PREVIEW_KEY, "1");
			else window.sessionStorage.removeItem(PREVIEW_KEY);
		} catch {
			// Storage unavailable: the preview lasts for this page only.
		}
	};
	return [on, set];
}

/** Better Auth's ?error= says the account was refused: never previewable. */
function isNotAllowed(search: unknown): boolean {
	const error = (search as Record<string, unknown>).error;
	return (
		typeof error === "string" &&
		(NOT_ALLOWED_ERRORS as readonly string[]).includes(error)
	);
}

/** The signed-in operator, for anything inside the gate. */
export type SignedIn = { user: SessionUser; signOut: () => Promise<void> };

const SignedInContext = createContext<SignedIn | null>(null);

/** The gate's context, for rendering one component as signed in or preview in a test. */
export const SignedInProvider = SignedInContext.Provider;

export function useSignedIn(): SignedIn {
	const signedIn = useContext(SignedInContext);
	if (!signedIn) throw new Error("useSignedIn must be used inside <AuthGate>");
	return signedIn;
}

/**
 * True for the development preview, which has no session: avel-server
 * refuses its writes, so an edit control says "Sign in to edit" instead.
 * False outside the gate too (a component rendered on its own in a test),
 * where nothing is known to refuse.
 */
export function useIsPreview(): boolean {
	return useContext(SignedInContext)?.user.id === PREVIEW_USER.id;
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
	const [preview, setPreview] = usePreview();

	const previewable =
		state.status === "unreachable" ||
		(state.status === "signed-out" && !isNotAllowed(location.search));
	if (import.meta.env.DEV && preview && previewable) {
		return (
			<SignedInContext.Provider
				value={{ user: PREVIEW_USER, signOut: async () => setPreview(false) }}
			>
				{children}
			</SignedInContext.Provider>
		);
	}

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
			onPreview={import.meta.env.DEV ? () => setPreview(true) : undefined}
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
	onPreview,
	children,
}: {
	state: SessionState;
	/** Better Auth's `?error=` code from a failed sign-in, if any. */
	error?: string;
	onSignIn: () => Promise<void>;
	onSignOut: () => Promise<void>;
	/** Development only: the unreachable screen's preview button. */
	onPreview?: () => void;
	children: ReactNode;
}) {
	switch (state.status) {
		case "checking":
			return <CheckingScreen />;
		case "unreachable":
			return (
				<UnreachableScreen
					onRetry={state.retry}
					retrying={state.retrying}
					onPreview={onPreview}
				/>
			);
		case "signed-out":
			if (error && (NOT_ALLOWED_ERRORS as readonly string[]).includes(error)) {
				return <NotAllowedScreen onTryAnother={onSignIn} />;
			}
			return (
				<SignInScreen
					onSignIn={onSignIn}
					onPreview={onPreview}
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
