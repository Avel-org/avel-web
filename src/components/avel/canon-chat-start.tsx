import type { CanonMode, CanonSession } from "avel-server/contract";
import { BotMessageSquare } from "lucide-react";
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
import { CHAT_COLUMN, ChatsButton, COMPOSER_COLUMN } from "./canon-chat-layout";
import {
	CANON_MODE_COPY,
	CANON_MODE_ICON,
	CanonModeSwitch,
} from "./canon-chat-mode";
import { ChatComposer } from "./chat-composer";
import { ErrorState } from "./surface";

/*
 * A new chat, before it exists: Canon's welcome, and the composer with the
 * mode and, optionally, a client. Nothing is made until the first message:
 * Send opens the session (open, or the client's), then posts the message
 * into it, then shows the chat. The create route takes no Idempotency-Key,
 * so a send whose message failed keeps the session it made and posts into
 * that one when sent again, rather than opening a second, empty chat.
 */

/**
 * What to ask, by mode: a click puts it in the composer, never sends it.
 * Fetch's read the command center's data; ask's only need what is written.
 */
export const CANON_SUGGESTIONS = {
	ask: [
		"Draft a kickoff checklist for a new client",
		"How should I scope a booking app's first sprint?",
		"Write a short status update for a client",
		"When should a mission use a playbook?",
	],
	fetch: [
		"Which missions need me right now?",
		"What have we spent this week, by mission?",
		"Show the open findings across missions",
		"Which intakes are waiting for approval?",
	],
} as const satisfies Record<Exclude<CanonMode, "draft">, readonly string[]>;

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
	const reason =
		trimmed === "" ? "Write a message first" : sending ? "Sending" : undefined;

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
				className={cn(
					"relative flex flex-1 flex-col items-center py-8",
					CHAT_COLUMN,
				)}
			>
				{/* Over the corner, not on a row of its own: a row pushed the
				    welcome down on a phone and left a band above it. */}
				<div
					data-testid="home-chat-start-chats"
					className="absolute top-2 left-2"
				>
					<ChatsButton onClick={onShowChats} />
				</div>
				<div aria-hidden="true" className="flex-2" />
				<div className="flex w-full flex-col items-center gap-3 text-center">
					<span
						aria-hidden="true"
						className="mb-1 grid size-12 place-items-center rounded-card border border-accent-line bg-accent-soft text-accent-text shadow-card [&_svg]:size-6"
					>
						<BotMessageSquare />
					</span>
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
					<ul
						aria-label="Suggestions"
						data-testid="home-chat-suggestions"
						className="mt-4 grid w-full max-w-2xl grid-cols-1 gap-2 sm:grid-cols-2"
					>
						{CANON_SUGGESTIONS[mode].map((suggestion) => {
							const Icon = CANON_MODE_ICON[mode];
							return (
								<li key={suggestion}>
									<button
										type="button"
										data-testid="home-chat-suggestion"
										onClick={() => setText(suggestion)}
										className="group/s flex h-full w-full items-start gap-2.5 rounded-card border border-border bg-app-panel px-3 py-2.5 text-left shadow-card transition-colors duration-(--duration-micro) ease-avel hover:border-accent-line hover:bg-accent-soft"
									>
										<Icon
											aria-hidden="true"
											className="mt-0.5 size-4 shrink-0 text-text-subtle group-hover/s:text-accent-text"
										/>
										<span className="type-small text-text">{suggestion}</span>
									</button>
								</li>
							);
						})}
					</ul>
				</div>
				<div aria-hidden="true" className="flex-3" />
			</div>
			<div
				data-testid="home-chat-dock"
				className="sticky bottom-0 bg-app-page pt-2 pb-10"
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
					className="h-7 max-w-44 border-border bg-composer-chip shadow-none hover:bg-app-raised"
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
