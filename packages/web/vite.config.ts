import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite"
import path from "path";
import runableAnalyticsPlugin from "./vite/__plugins/runable-analytics-plugin";
import honoDevPlugin from "./vite/__plugins/hono-dev-plugin";
import assetOptimizerPlugin from "./vite/__plugins/asset-optimizer-plugin";
import seoPlugin from "./vite/plugins/seo-plugin";

const root = path.resolve(__dirname, "../..");

export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, root, '');
	Object.assign(process.env, env);

	return {
		// All env files live at the repo root — keep Vite's own env loading there too,
		// so packages/web/.env* files can never shadow the root .env.
		envDir: root,
		plugins: [honoDevPlugin(), react(), runableAnalyticsPlugin(), tailwind(), assetOptimizerPlugin(), seoPlugin()],
		resolve: {
			alias: {
				"@": path.resolve(__dirname, "./src/web"),
			},
		},
		build: {
			// Keep the entry bundle lean: heavy third-party libs get their own
			// long-cacheable chunks instead of riding along with app code.
			rollupOptions: {
				output: {
					manualChunks: {
						react: ["react", "react-dom", "react-dom/client"],
						charts: ["recharts"],
						motion: ["motion/react"],
						query: ["@tanstack/react-query", "@orpc/client", "@orpc/tanstack-query"],
					},
				},
			},
			chunkSizeWarningLimit: 700,
		},
		server: {
			allowedHosts: true,
			hmr: { overlay: false, },
			cors: false
		}
	};
});
