/**
 * Route metadata, declared by every route through `staticData`.
 *
 * `device` (ROUTES.md, AVEL-DESIGN.md section 9). The client decides only what
 * to render; avel-server enforces what each surface may do.
 *
 *   capture       works on a phone
 *   construction  desktop only; a phone sees the device-boundary notice
 *   approve       read and approve; a phone can approve, never initiate
 *
 * `crumb` labels the route in breadcrumbs when it has no sidebar link, for
 * example `crumb: ({ id }) => id` on /missions/$id until the mission's name
 * comes from the contract.
 */
export type Device = "capture" | "construction" | "approve";

export type CrumbLabel = string | ((params: Record<string, string>) => string);

declare module "@tanstack/react-router" {
	interface StaticDataRouteOption {
		device?: Device;
		crumb?: CrumbLabel;
	}
}
