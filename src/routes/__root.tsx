import {
	createRootRoute,
	HeadContent,
	Outlet,
	Scripts,
} from "@tanstack/react-router";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ApiProvider } from "@/lib/api";
import { ThemeRoot } from "@/lib/theme";
import { AppShell } from "../shell/app-shell";
import { NotFoundPage } from "../shell/not-found";
import appCss from "../styles/app.css?url";

export const Route = createRootRoute({
	head: () => ({
		meta: [
			{ charSet: "utf-8" },
			{ name: "viewport", content: "width=device-width, initial-scale=1" },
			{ title: "AVEL Command Center" },
		],
		links: [
			{ rel: "stylesheet", href: appCss },
			{ rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
		],
	}),
	shellComponent: RootDocument,
	component: Layout,
	// A designed page for an address no route matches, inside the canvas.
	// Without it TanStack prints a bare "Not Found" where the page would be.
	notFoundComponent: NotFoundPage,
});

function Layout() {
	return (
		<ApiProvider>
			<ThemeRoot>
				<TooltipProvider delayDuration={300}>
					<AppShell>
						<Outlet />
					</AppShell>
					{/* One toaster for the app, inside ThemeRoot so it follows .dark. */}
					<Toaster />
				</TooltipProvider>
			</ThemeRoot>
		</ApiProvider>
	);
}

function RootDocument({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en">
			<head>
				<HeadContent />
			</head>
			<body>
				{children}
				<Scripts />
			</body>
		</html>
	);
}
