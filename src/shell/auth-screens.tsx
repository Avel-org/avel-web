import { CircleSlash, LogIn, LogOut, ServerOff } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import type { SessionUser } from "@/lib/auth";
import { BrandMark } from "./brand-mark";
import { initials } from "./operator";

/**
 * The screens the sign-in gate shows instead of the shell. Each is one calm,
 * centred column on the desktop surface: the mark, a heading, a sentence and
 * at most one action. They own the page's h1, because no top bar is drawn.
 */
function AuthScreen({
	testId,
	busy = false,
	children,
}: {
	testId: string;
	busy?: boolean;
	children: ReactNode;
}) {
	return (
		<main
			id="main"
			data-testid={testId}
			aria-busy={busy || undefined}
			className="flex min-h-dvh items-center justify-center bg-app-bg px-4 py-12 pt-[max(3rem,env(safe-area-inset-top))] pb-[max(3rem,env(safe-area-inset-bottom))]"
		>
			<div className="flex w-full max-w-sm flex-col items-center text-center">
				{children}
			</div>
		</main>
	);
}

function Heading({ children }: { children: ReactNode }) {
	return (
		<h1 className="mt-6 type-h1 text-balance text-foreground">{children}</h1>
	);
}

function Line({ children, testId }: { children: ReactNode; testId?: string }) {
	return (
		<p
			data-testid={testId}
			className="mt-2 type-body text-pretty text-text-muted"
		>
			{children}
		</p>
	);
}

/**
 * While the session is unknown: the mark alone. Nothing of the shell, so no
 * protected content can appear before the gate has decided.
 */
export function CheckingScreen() {
	return (
		<AuthScreen testId="auth-checking" busy>
			<BrandMark size="lg" />
			<output className="sr-only">Checking your session</output>
		</AuthScreen>
	);
}

/**
 * Signed out. "Continue with GitHub" starts Better Auth's GitHub sign-in and
 * comes back to the page the operator asked for.
 */
export function SignInScreen({
	onSignIn,
	notice,
	onPreview,
}: {
	onSignIn: () => Promise<void>;
	/** Why a previous attempt ended here, when it did. */
	notice?: string;
	/** Development only: look at the interface without signing in. */
	onPreview?: () => void;
}) {
	const [state, setState] = useState<"idle" | "starting" | "failed">("idle");
	const start = async () => {
		setState("starting");
		try {
			await onSignIn();
		} catch {
			setState("failed");
		}
	};
	return (
		<AuthScreen testId="auth-sign-in">
			<BrandMark size="lg" />
			<Heading>Sign in to AVEL</Heading>
			<Line>
				AVEL runs AI agents on real client work and refuses to ship anything it
				cannot prove.
			</Line>
			{notice ? (
				<p
					role="alert"
					data-testid="auth-sign-in-notice"
					className="mt-6 w-full rounded-md border border-border bg-app-panel px-4 py-3 type-small text-text-muted"
				>
					{notice}
				</p>
			) : null}
			<Button
				size="lg"
				data-testid="auth-sign-in-github"
				className="mt-8 w-full"
				disabled={state === "starting"}
				onClick={start}
			>
				<LogIn aria-hidden="true" />
				{state === "starting" ? "Opening GitHub" : "Continue with GitHub"}
			</Button>
			{state === "failed" ? (
				<p
					role="alert"
					data-testid="auth-sign-in-failed"
					className="mt-3 type-small text-text-muted"
				>
					Sign-in could not start. Check that avel-server is running, then try
					again.
				</p>
			) : null}
			<p className="mt-4 type-caption text-text-subtle">
				Only operators on this Command Center's allowlist can sign in.
			</p>
			{onPreview ? (
				<>
					<Button
						variant="ghost"
						size="lg"
						data-testid="auth-sign-in-preview"
						className="mt-6 w-full"
						onClick={onPreview}
					>
						Preview without signing in
					</Button>
					<p className="mt-2 type-caption text-text-subtle">
						Development only. avel-server refuses data to anyone not signed in,
						so pages that need data say so.
					</p>
				</>
			) : null}
		</AuthScreen>
	);
}

/**
 * The account is not an operator. Reached two ways: a sign-in the allowlist
 * refused (no session exists, so no account can be named), or a live session
 * whose account was taken off the allowlist (named, with Sign out).
 */
export function NotAllowedScreen({
	account,
	onSignOut,
	onTryAnother,
}: {
	account?: SessionUser;
	onSignOut?: () => Promise<void>;
	onTryAnother?: () => Promise<void>;
}) {
	return (
		<AuthScreen testId="auth-not-allowed">
			<span className="flex size-12 items-center justify-center rounded-md border border-border bg-app-panel">
				<CircleSlash aria-hidden="true" className="size-5 text-gate-block" />
			</span>
			<Heading>
				This GitHub account isn't allowed into this Command Center
			</Heading>
			<Line>
				Only operators on its allowlist can use it. An admin can add the
				account.
			</Line>
			{account ? (
				<div
					data-testid="auth-not-allowed-account"
					className="mt-6 flex w-full items-center gap-3 rounded-md border border-border bg-app-panel px-4 py-3 text-left"
				>
					<OperatorAvatar user={account} />
					<span className="flex min-w-0 flex-col">
						<span className="truncate type-body font-medium text-foreground">
							{account.name || account.githubLogin}
						</span>
						<span className="truncate type-mono-small text-text-subtle">
							@{account.githubLogin}
						</span>
					</span>
				</div>
			) : null}
			{onSignOut ? (
				<Button
					variant="outline"
					size="lg"
					data-testid="auth-not-allowed-sign-out"
					className="mt-6 w-full"
					onClick={() => onSignOut()}
				>
					<LogOut aria-hidden="true" />
					Sign out
				</Button>
			) : null}
			{onTryAnother ? (
				<Button
					variant="outline"
					size="lg"
					data-testid="auth-not-allowed-retry"
					className="mt-6 w-full"
					onClick={() => onTryAnother()}
				>
					<LogIn aria-hidden="true" />
					Sign in with another account
				</Button>
			) : null}
		</AuthScreen>
	);
}

/** avel-server did not answer the session check. Not the sign-in screen. */
export function UnreachableScreen({
	onRetry,
	retrying,
	onPreview,
}: {
	onRetry: () => void;
	retrying: boolean;
	/** Development only: look at the interface while avel-server is down. */
	onPreview?: () => void;
}) {
	return (
		<AuthScreen testId="auth-unreachable">
			<span className="flex size-12 items-center justify-center rounded-md border border-border bg-app-panel">
				<ServerOff aria-hidden="true" className="size-5 text-text-muted" />
			</span>
			<Heading>Can't reach avel-server</Heading>
			<Line>
				The Command Center could not check your session, so nothing is shown.
				Nothing was written.
			</Line>
			<Button
				variant="outline"
				size="lg"
				data-testid="auth-unreachable-retry"
				className="mt-8 w-full"
				disabled={retrying}
				onClick={onRetry}
			>
				{retrying ? "Trying again" : "Try again"}
			</Button>
			{onPreview ? (
				<>
					<Button
						variant="ghost"
						size="lg"
						data-testid="auth-unreachable-preview"
						className="mt-2 w-full"
						onClick={onPreview}
					>
						Preview without avel-server
					</Button>
					<p className="mt-2 type-caption text-text-subtle">
						Development only. Pages that need data say avel-server is
						unreachable until it runs.
					</p>
				</>
			) : null}
		</AuthScreen>
	);
}

/** The operator's GitHub avatar, or their initials while it loads or if it fails. */
export function OperatorAvatar({
	user,
	className,
}: {
	user: SessionUser;
	className?: string;
}) {
	return (
		<Avatar data-testid="operator-avatar" className={className}>
			{user.image ? <AvatarImage src={user.image} alt="" /> : null}
			<AvatarFallback className="bg-app-raised type-caption font-medium text-foreground">
				{initials(user.name || user.githubLogin)}
			</AvatarFallback>
		</Avatar>
	);
}
