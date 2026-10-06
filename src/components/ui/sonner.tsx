import {
	CircleCheckIcon,
	InfoIcon,
	Loader2Icon,
	OctagonXIcon,
	TriangleAlertIcon,
} from "lucide-react";
import type * as React from "react";
import { Toaster as Sonner, type ToasterProps } from "sonner";
import { useTheme } from "@/lib/theme";

// shadcn reads the theme from next-themes. AVEL's theme is the .light class on
// the app shell, read through useTheme, so Sonner's own text and icon colours
// follow it too. The surface colours below are tokens.
const Toaster = ({ ...props }: ToasterProps) => {
	const { theme } = useTheme();
	return (
		<Sonner
			theme={theme}
			className="toaster group"
			icons={{
				success: <CircleCheckIcon className="size-4 text-gate-pass" />,
				info: <InfoIcon className="size-4 text-text-muted" />,
				warning: <TriangleAlertIcon className="size-4 text-gate-warn" />,
				error: <OctagonXIcon className="size-4 text-gate-block" />,
				loading: <Loader2Icon className="size-4 animate-spin" />,
			}}
			style={
				{
					"--normal-bg": "var(--color-app-float)",
					"--normal-text": "var(--color-text)",
					"--normal-border": "var(--color-border-strong)",
					"--border-radius": "var(--radius-lg)",
				} as React.CSSProperties
			}
			{...props}
		/>
	);
};

export { Toaster };
