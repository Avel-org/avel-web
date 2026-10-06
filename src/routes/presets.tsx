import { createFileRoute } from "@tanstack/react-router";
import { Surface } from "@/components/avel/surface";
import { linkFor } from "../shell/nav";
import { Page, pageHead } from "../shell/page";

export const Route = createFileRoute("/presets")({
	staticData: { device: "construction" },
	head: pageHead("/presets"),
	component: PresetsPage,
});

function PresetsPage() {
	return (
		<Page to="/presets">
			<Surface
				data-testid="preset-list"
				notBuilt={{
					icon: linkFor("/presets").icon,
					title: "Saved rosters",
					what: "Save a roster once and apply it to any mission. Applying copies the roster into the mission, so later edits to the preset never change it.",
					needs: ["preset.list"],
				}}
			/>
		</Page>
	);
}
