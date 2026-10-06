import { Link } from "@tanstack/react-router";
import { Compass } from "lucide-react";
import { EmptyState } from "@/components/avel/empty-state";
import { Button } from "@/components/ui/button";
import { Page } from "./page";

/**
 * The root route's not-found page: an address no route matches. It renders
 * inside the shell's canvas like any page, never TanStack's bare default
 * text, which is what showed at the canvas's top-left before this existed.
 */
export function NotFoundPage() {
	return (
		<Page title="Page not found" definition="No page lives at this address.">
			<EmptyState
				data-testid="not-found"
				icon={Compass}
				title="This page doesn't exist"
				description="The address may be mistyped, or the page may have moved."
				action={
					<Button asChild variant="outline">
						<Link to="/" data-testid="not-found-home">
							Go to Home
						</Link>
					</Button>
				}
			/>
		</Page>
	);
}
