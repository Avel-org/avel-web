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

// shadcn reads the theme from next-themes. AVEL's is useTheme's "light" or
// "dark" (`.dark` on the app shell), which is exactly Sonner's own theme
// prop, so Sonner's text and icon colours follow it too.
//
// The look is v3 .toast: the float surface at the card radius, the popover
// shadow and, in dark, the float outline as its edge; the icon sits in a 22px
// soft circle of its tone (.toast-icon). Sonner injects its stylesheet
// outside Tailwind's layers, so the overrides carry `!`. Info is a machine's
// note, so it takes the pending tone, never the accent (audit D3).
const Toaster = ({ ...props }: ToasterProps) => {
	const { theme } = useTheme();
	return (
		<Sonner
			theme={theme}
			className="toaster group"
			icons={{
				success: <CircleCheckIcon className="size-[13px] text-gate-pass" />,
				info: <InfoIcon className="size-[13px] text-gate-pending" />,
				warning: <TriangleAlertIcon className="size-[13px] text-gate-warn" />,
				error: <OctagonXIcon className="size-[13px] text-gate-block" />,
				loading: (
					<Loader2Icon className="size-[13px] animate-spin text-text-muted" />
				),
			}}
			toastOptions={{
				classNames: {
					toast:
						"gap-2.5! py-2.5! pr-2! pl-3! shadow-popover! type-small! font-sans!",
					title: "font-medium! text-text!",
					description: "text-text-muted!",
					icon: "m-0! grid! size-[22px]! place-items-center rounded-full bg-gate-pending-soft",
					success: "[&_[data-icon]]:bg-gate-pass-soft!",
					error: "[&_[data-icon]]:bg-gate-block-soft!",
					warning: "[&_[data-icon]]:bg-gate-warn-soft!",
				},
			}}
			style={
				{
					"--normal-bg": "var(--color-app-float)",
					"--normal-text": "var(--color-text)",
					"--normal-border": "var(--color-float-outline)",
					"--border-radius": "var(--radius-card)",
					"--width": "400px",
				} as React.CSSProperties
			}
			{...props}
		/>
	);
};

export { Toaster };
