import { Redis } from "@upstash/redis";
import type { SessionDriver } from "astro";

export default function createSessionDriver(): SessionDriver {
	const url = process.env.KV_REST_API_URL;
	const token = process.env.KV_REST_API_TOKEN;
	if (!url) {
		throw new Error("Missing required environment variable: KV_REST_API_URL");
	}
	if (!token) {
		throw new Error("Missing required environment variable: KV_REST_API_TOKEN");
	}

	const redis = new Redis({ url, token, automaticDeserialization: false });
	const storageKey = (key: string) => `gawd-blog:sessions:${key}`;

	return {
		getItem: (key) => redis.get(storageKey(key)),
		async setItem(key, value) {
			await redis.set(storageKey(key), value);
		},
		async removeItem(key) {
			await redis.unlink(storageKey(key));
		},
	};
}
