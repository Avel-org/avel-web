import { useState } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
	type ClientActions,
	useClientOverlays,
} from "../src/components/avel/client-overlays";

// Clients opens New client from an effect on ?new, with the actions as a
// dependency. Fresh actions on every render re-ran that effect until React
// stopped it ("Maximum update depth exceeded"): a load of /clients?new=true
// fell to the error boundary. The actions must survive a re-render.

describe("useClientOverlays", () => {
	it("keeps the same actions across a re-render", () => {
		const seen: ClientActions[] = [];
		function Probe() {
			const { actions } = useClientOverlays({ onShowEngagements: () => {} });
			const [renders, setRenders] = useState(0);
			seen.push(actions);
			// A render-phase update re-renders this component at once, with
			// its hooks kept: the second pass is a re-render, not a remount.
			if (renders === 0) setRenders(1);
			return null;
		}
		renderToString(<Probe />);
		expect(seen.length).toBeGreaterThanOrEqual(2);
		expect(seen[1]).toBe(seen[0]);
		expect(seen[1]?.onNewClient).toBe(seen[0]?.onNewClient);
	});
});
