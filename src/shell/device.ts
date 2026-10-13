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
 * example `crumb: "Mission"` on /missions/$id. Never an id.
 *
 * `useCrumbName` names it from data, a hook called while the crumb renders:
 * /missions/$id reads its mission and says "Meridian, booking, sprint 3".
 * It returns undefined until the data is read, and `crumb` shows meanwhile.
 */
export type Device = "capture" | "construction" | "approve";

export type CrumbLabel = string | ((params: Record<string, string>) => string);

export type CrumbNameHook = (
	params: Record<string, string>,
) => string | undefined;

declare module "@tanstack/react-router" {
	interface StaticDataRouteOption {
		device?: Device;
		crumb?: CrumbLabel;
		useCrumbName?: CrumbNameHook;
	}
}
