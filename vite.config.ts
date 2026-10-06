import { request } from "node:http";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig, type Plugin } from "vite";

// avel-server sends no CORS headers, so the browser never calls it directly.
// It calls /api on this app's own origin, which forwards to avel-server: Nitro's
// route rule in production, and devApiProxy below in `pnpm dev`. Set
// AVEL_API_ORIGIN for any server other than the local one.
const apiOrigin = process.env.AVEL_API_ORIGIN ?? "http://localhost:8787";

/**
 * In development TanStack Start answers every request before Vite's
 * server.proxy or Nitro's route rules run, so /api would 404. This middleware
 * is registered ahead of Start's and streams the request through instead.
 */
function devApiProxy(origin: string): Plugin {
	const target = new URL(origin);
	return {
		name: "avel-dev-api-proxy",
		apply: "serve",
		configureServer(server) {
			server.middlewares.use((req, res, next) => {
				if (!req.url?.startsWith("/api/") && req.url !== "/api") return next();
				const upstream = request(
					{
						hostname: target.hostname,
						port: target.port,
						path: req.url,
						method: req.method,
						headers: { ...req.headers, host: target.host },
					},
					(response) => {
						res.writeHead(response.statusCode ?? 502, response.headers);
						response.pipe(res);
					},
				);
				upstream.on("error", () => {
					res.writeHead(502, { "content-type": "application/json" });
					res.end(
						JSON.stringify({
							message: `avel-server is not reachable at ${origin}`,
						}),
					);
				});
				req.pipe(upstream);
			});
		},
	};
}

export default defineConfig({
	resolve: { tsconfigPaths: true },
	plugins: [
		devApiProxy(apiOrigin),
		nitro({ routeRules: { "/api/**": { proxy: `${apiOrigin}/api/**` } } }),
		tailwindcss(),
		tanstackStart(),
		viteReact(),
	],
});
