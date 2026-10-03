import node from "@astrojs/node";
import react from "@astrojs/react";
import vercel from "@astrojs/vercel";
import { defineConfig, fontProviders } from "astro/config";
import emdash, { local, s3 } from "emdash/astro";
import { libsql, sqlite } from "emdash/db";

const isVercel = process.env.VERCEL === "1";

function requiredEnv(name) {
	const value = process.env[name];
	if (!value) {
		throw new Error(`Missing required environment variable: ${name}`);
	}
	return value;
}

const siteUrl = isVercel ? requiredEnv("EMDASH_SITE_URL") : undefined;

export default defineConfig({
	output: "server",
	adapter: isVercel ? vercel() : node({ mode: "standalone" }),
	image: {
		layout: "constrained",
		responsiveStyles: true,
	},
	integrations: [
		react(),
		emdash({
			siteUrl,
			database: isVercel
				? libsql({
						url: requiredEnv("TURSO_DATABASE_URL"),
						authToken: requiredEnv("TURSO_AUTH_TOKEN"),
					})
				: sqlite({ url: "file:./data.db" }),
			storage: isVercel
				? s3()
				: local({
						directory: "./uploads",
						baseUrl: "/_emdash/api/media/file",
					}),
			migrations: {
				runtime: isVercel ? "check" : "auto",
				dev: "auto",
			},
		}),
	],
	fonts: [
		{
			provider: fontProviders.google(),
			name: "Inter",
			cssVariable: "--font-body",
			weights: [400, 500, 600, 700],
			fallbacks: ["sans-serif"],
		},
		{
			provider: fontProviders.google(),
			name: "JetBrains Mono",
			cssVariable: "--font-mono",
			weights: [400, 500],
			fallbacks: ["monospace"],
		},
	],
	devToolbar: { enabled: false },
});
