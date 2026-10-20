import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { sampleQuery } from "@/components/avel/catalog-sample";
import { DriveBrowser, type DriveState } from "@/components/avel/drive-browser";
import { UploadButton } from "@/components/avel/drive-files";
import { FILE_KINDS, SAMPLE_FILES } from "@/components/avel/drive-placeholders";
import { Page, pageHead } from "../shell/page";

/**
 * The Drive's state in the URL, so a folder, a search or a file is a link.
 * Anything malformed is dropped rather than shown: a stale or unknown value
 * falls back to the whole Drive, the list, newest first.
 */
export const driveSearch = z.object({
	folder: z.string().max(80).optional().catch(undefined),
	file: z.string().max(80).optional().catch(undefined),
	view: z.enum(["list", "grid"]).optional().catch(undefined),
	kind: z
		.enum(FILE_KINDS as [string, ...string[]])
		.optional()
		.catch(undefined),
	q: z.string().max(200).optional().catch(undefined),
	sort: z.enum(["newest", "name", "size"]).optional().catch(undefined),
});

export const Route = createFileRoute("/drive")({
	staticData: { device: "construction" },
	head: pageHead("/drive"),
	validateSearch: driveSearch,
	component: DrivePage,
});

/**
 * The whole Drive across scopes: general documents, then each client and its
 * engagements (ruling 33). Every file is a sample until the Drive's routes
 * are built, after the first mission; every write is disabled with its reason.
 */
function DrivePage() {
	const search = Route.useSearch();
	const navigate = useNavigate({ from: "/drive" });
	const state: DriveState = {
		folder: search.folder,
		file: search.file,
		// Cards on the canvas by default; the list is the toggle.
		view: search.view ?? "grid",
		kind: search.kind as DriveState["kind"],
		q: search.q,
		sort: search.sort ?? "newest",
	};
	return (
		<Page to="/drive" actions={<UploadButton data-testid="drive-upload" />}>
			<DriveBrowser
				query={sampleQuery(SAMPLE_FILES)}
				state={state}
				onChange={(next) =>
					navigate({
						// Defaults stay out of the URL, so the plain Drive is /drive.
						search: (prev) => {
							const merged = { ...prev, ...next };
							return {
								...merged,
								view: merged.view === "grid" ? undefined : merged.view,
								sort: merged.sort === "newest" ? undefined : merged.sort,
								q: merged.q === "" ? undefined : merged.q,
							};
						},
						replace: true,
					})
				}
			/>
		</Page>
	);
}
