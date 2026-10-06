import { Command } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { useCommandPalette } from "./app-shell";
import { Inbox } from "./top-inbox";

/**
 * The global cluster at the right of every top bar: the command menu (⌘K)
 * and the inbox of what needs you. Creating lives in ⌘K's Create group. Ghost
 * icon buttons, each named by its aria-label and its tooltip, so the cluster
 * stays quiet until it is needed. The theme lives in the operator menu and
 * in ⌘K.
 */
export function GlobalActions() {
	const palette = useCommandPalette();
	return (
		<div data-testid="global-actions" className="flex items-center gap-1">
			<Tooltip>
				<TooltipTrigger asChild>
					<Button
						variant="ghost"
						size="icon"
						aria-label="Command menu"
						aria-keyshortcuts="Meta+K Control+K"
						// The id predates the command menu; kept so tests and links to
						// it stay stable. It opens the same ⌘K menu.
						data-testid="global-search"
						onClick={palette.open}
					>
						<Command aria-hidden="true" />
					</Button>
				</TooltipTrigger>
				<TooltipContent sideOffset={6}>
					<span className="flex items-center gap-2">
						Command menu
						<kbd
							data-testid="global-search-shortcut"
							className="type-mono-small rounded-xs border border-border-strong px-1 text-text-muted"
						>
							{palette.shortcut}
						</kbd>
					</span>
				</TooltipContent>
			</Tooltip>
			<Inbox />
		</div>
	);
}
