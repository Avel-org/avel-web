import { useLocation, useMatches } from "@tanstack/react-router";
import { Check, Copy, Monitor, Share2 } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { Device } from "./device";
import { ALL_LINKS } from "./nav";
import { Page } from "./page";

// Below md, the layout is the phone layout. The same width drives the drawer.
const PHONE_QUERY = "(max-width: 47.999rem)";

/** Undefined until mounted: the server cannot know the width, so it renders the page. */
function useIsPhone(): boolean | undefined {
	const [isPhone, setIsPhone] = useState<boolean>();
	useEffect(() => {
		const query = window.matchMedia(PHONE_QUERY);
		const update = () => setIsPhone(query.matches);
		update();
		query.addEventListener("change", update);
		return () => query.removeEventListener("change", update);
	}, []);
	return isPhone;
}

/** The deepest route's declared class. */
export function useDevice(): Device | undefined {
	const matches = useMatches();
	for (let i = matches.length - 1; i >= 0; i--) {
		const device = matches[i]?.staticData?.device;
		if (device) return device;
	}
	return undefined;
}

/**
 * Construction routes are desktop only. A phone gets a designed notice saying
 * what the page is, why it needs a desktop, and a way to send itself the link:
 * never a redirect and never a blank. This decides only what renders;
 * avel-server separately refuses irreversible actions from a phone session.
 */
export function DeviceBoundary({ children }: { children: ReactNode }) {
	const device = useDevice();
	const isPhone = useIsPhone();
	if (device === "construction" && isPhone) return <DeviceBoundaryNotice />;
	return children;
}

export function DeviceBoundaryNotice() {
	const { pathname } = useLocation();
	const link = ALL_LINKS.find((l) => l.to === pathname);
	const [copied, setCopied] = useState(false);
	const [canShare, setCanShare] = useState(false);

	useEffect(() => setCanShare(typeof navigator.share === "function"), []);

	const url = () => window.location.href;

	const copy = async () => {
		try {
			await navigator.clipboard.writeText(url());
			setCopied(true);
		} catch {
			setCopied(false);
		}
	};

	// In the page's own frame, so a phone keeps the top bar: the menu button
	// (its only way to the rest of the app) and the global actions.
	return (
		<Page
			title={link?.label ?? "Desktop only"}
			definition="A construction screen, built for a desktop."
		>
			<div
				data-testid="device-boundary"
				className="flex min-h-[60vh] flex-col items-start justify-center gap-4 py-10"
			>
				<Monitor className="size-6 text-text-muted" aria-hidden="true" />
				<div className="flex flex-col gap-2">
					<h2 className="type-page text-text">
						{link
							? `${link.label} needs a desktop`
							: "This page needs a desktop"}
					</h2>
					{link ? (
						<p className="type-small text-text-muted">{link.purpose}</p>
					) : null}
					<p className="type-small text-text-muted">
						It is a construction screen: dense, and built for a keyboard and a
						wide window. Reading and approving work on a phone; building does
						not.
					</p>
				</div>
				{/* One row, the primary last: Copy, then Send where the phone can share. */}
				<div className="flex flex-wrap gap-2">
					<Button
						variant={canShare ? "outline" : "default"}
						onClick={copy}
						data-testid="device-boundary-copy"
					>
						{copied ? (
							<Check aria-hidden="true" />
						) : (
							<Copy aria-hidden="true" />
						)}
						{copied ? "Link copied" : "Copy the link"}
					</Button>
					{canShare ? (
						<Button
							onClick={() => navigator.share({ url: url() }).catch(() => {})}
							data-testid="device-boundary-share"
						>
							<Share2 aria-hidden="true" />
							Send the link
						</Button>
					) : null}
				</div>
				<p aria-live="polite" className="sr-only">
					{copied ? "Link copied" : ""}
				</p>
			</div>
		</Page>
	);
}
