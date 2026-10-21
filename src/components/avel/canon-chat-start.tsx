import type { CanonMode, CanonSession } from "avel-server/contract";
import { useId, useState } from "react";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	CANON_MESSAGE_MAX,
	type CanonAttempt,
	type CreateCanonSessionBody,
	canonAttemptFor,
	type PostCanonMessageBody,
	useCreateCanonSession,
	usePostCanonMessage,
} from "@/lib/api/canon";
import { useClients } from "@/lib/api/clients";
import { cn } from "@/lib/utils";
import { useIsPreview } from "@/shell/auth-gate";
import { CHAT_COLUMN, ChatsButton, COMPOSER_COLUMN } from "./canon-chat-layout";
import { CANON_MODE_COPY, CanonModeSwitch } from "./canon-chat-mode";
import { ChatComposer } from "./chat-composer";
import { formatTokens } from "./dispatch-budget";
import { ErrorState } from "./surface";

/*
 * A new chat, before it exists: Canon's welcome, and the composer with the
 * mode and, optionally, a client. Nothing is made until the first message:
 * Send opens the session (open, or the client's), then posts the message
 * into it, then shows the chat. The create route takes no Idempotency-Key,
 * so a send whose message failed keeps the session it made and posts into
 * that one when sent again, rather than opening a second, empty chat.
 */

/** The client picker's "no client" choice: an open chat. */
const OPEN = "open";

export function CanonChatStart({
	onStarted,
	onShowChats,
}: {
	/** The chat exists and holds the first message. */
	onStarted: (sessionId: string) => void;
	onShowChats: () => void;
}) {
	const preview = useIsPreview();
	const create = useCreateCanonSession();
	const post = usePostCanonMessage(null);
	const [text, setText] = useState("");
	const [mode, setMode] = useState<Exclude<CanonMode, "draft">>("ask");
	const [clientId, setClientId] = useState<string | null>(null);
	// The session an earlier send made, under the body it was made with.
	const [made, setMade] = useState<{
		body: string;
		session: CanonSession;
	} | null>(null);
	const [last, setLast] = useState<CanonAttempt<PostCanonMessageBody> | null>(
		null,
	);
	const trimmed = text.trim();
	const body: CreateCanonSessionBody = clientId
		? { scope: "client", clientId, mode }
		: { scope: "open", mode };
	const sending = create.isPending || post.isPending;
	const reason = preview
		? "Sign in to write to Canon"
		: trimmed === ""
			? "Write a message first"
			: sending
				? "Sending"
				: undefined;

	const send = async () => {
		const key = JSON.stringify(body);
		try {
			const session =
				made?.body === key ? made.session : await create.mutateAsync(body);
			setMade({ body: key, session });
			const attempt = canonAttemptFor(last, { contentMd: trimmed, mode });
			setLast(attempt);
			await post.mutateAsync({ ...attempt, sessionId: session.id });
			onStarted(session.id);
		} catch {
			// The failed write's error shows below; Send again resumes it.
		}
	};
	const error = create.error ?? post.error;

	return (
		<>
			{/* The prompt sits at the optical centre of the space above the
			    composer: two parts above to three below, so it reads as centred
			    rather than sinking toward the input. */}
			<div
				data-testid="home-chat-thread"
				className={cn("flex flex-1 flex-col items-center py-8", CHAT_COLUMN)}
			>
				<div className="self-start">
					<ChatsButton onClick={onShowChats} />
				</div>
				<div aria-hidden="true" className="flex-2" />
				<div className="flex w-full flex-col items-center gap-3 text-center">
					<p
						data-testid="home-chat-prompt"
						className="type-display text-foreground"
					>
						What should we work on?
					</p>
					<p
						data-testid="home-chat-note"
						className="max-w-prose type-small text-text-muted"
					>
						{CANON_MODE_COPY[mode].hint}
						{clientId ? " Only this client's." : ""}
					</p>
				</div>
				<div aria-hidden="true" className="flex-3" />
			</div>
			<div
				data-testid="home-chat-dock"
				className="sticky bottom-0 bg-card pt-2 pb-10"
			>
				<div
					data-testid="home-chat-composer-column"
					className={cn("flex flex-col gap-2", COMPOSER_COLUMN)}
				>
					<ChatComposer
						label="Message to Canon"
						placeholder="Ask Canon anything"
						value={text}
						onChange={setText}
						maxLength={CANON_MESSAGE_MAX}
						sendDisabledReason={reason}
						onSend={() => void send()}
						tools={
							<>
								<CanonModeSwitch
									value={mode}
									hasIntake={false}
									disabledReason={sending ? "Sending" : undefined}
									onChange={(next) => {
										if (next !== "draft") setMode(next);
									}}
								/>
								<ClientPicker
									value={clientId}
									onChange={setClientId}
									disabledReason={sending ? "Sending" : undefined}
								/>
								<span
									data-testid="canon-composer-count"
									className="px-1 type-caption text-text-subtle tabular-nums max-sm:hidden"
								>
									{`${formatTokens(text.length)} / ${formatTokens(CANON_MESSAGE_MAX)}`}
								</span>
							</>
						}
					/>
					{error ? <ErrorState error={error} /> : null}
				</div>
			</div>
		</>
	);
}

/**
 * Which client the chat is about: none (an open chat, which reads every
 * client in fetch mode) or one active client (it reads only that client).
 */
function ClientPicker({
	value,
	onChange,
	disabledReason,
}: {
	value: string | null;
	onChange: (clientId: string | null) => void;
	disabledReason?: string;
}) {
	const id = useId();
	const clients = useClients(undefined, "active");
	const list = clients.data?.pages.flatMap((p) => p.data) ?? [];
	const chosen = list.find((c) => c.id === value);
	return (
		<>
			<label htmlFor={id} className="sr-only">
				Client
			</label>
			<Select
				value={value ?? OPEN}
				onValueChange={(next) => onChange(next === OPEN ? null : next)}
				disabled={disabledReason !== undefined}
			>
				<SelectTrigger
					id={id}
					size="sm"
					data-testid="canon-chat-client"
					className="h-7 max-w-44 border-transparent bg-transparent shadow-none"
				>
					<SelectValue>{chosen ? chosen.name : "No client"}</SelectValue>
				</SelectTrigger>
				<SelectContent>
					<SelectItem value={OPEN}>No client</SelectItem>
					{list.map((c) => (
						<SelectItem key={c.id} value={c.id}>
							{c.name}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</>
	);
}
