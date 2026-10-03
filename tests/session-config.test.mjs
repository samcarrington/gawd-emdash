import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

const configUrl = new URL("../astro.config.mjs", import.meta.url).href;
const driverUrl = new URL("../src/session-driver.ts", import.meta.url).href;
const configScript = `
	const { default: config } = await import(${JSON.stringify(configUrl)});
	console.log(JSON.stringify({
		adapter: config.adapter.name,
		session: config.session ?? null,
	}));
`;

function runScript(script, environment = {}) {
	return spawnSync(process.execPath, ["--input-type=module", "--eval", script], {
		encoding: "utf8",
		env: {
			...process.env,
			VERCEL: "1",
			EMDASH_SITE_URL: "https://sessions.example.com",
			TURSO_DATABASE_URL: "libsql://sessions-test.turso.io",
			TURSO_AUTH_TOKEN: "test-database-token",
			UPSTASH_REDIS_REST_URL: "",
			UPSTASH_REDIS_REST_TOKEN: "",
			KV_REST_API_URL: "https://sessions-test.upstash.io",
			KV_REST_API_TOKEN: "test-session-token",
			...environment,
		},
	});
}

function loadConfig(environment = {}) {
	return runScript(configScript, environment);
}

test("Vercel uses shared Upstash sessions without embedding credentials", () => {
	const result = loadConfig();
	assert.equal(result.status, 0, result.stderr);
	const config = JSON.parse(result.stdout);
	assert.equal(config.adapter, "@astrojs/vercel");
	assert.deepEqual(config.session, {
		driver: {
			entrypoint: driverUrl,
		},
	});
	assert.ok(!result.stdout.includes("test-session-token"));
	assert.ok(!result.stdout.includes("sessions-test.upstash.io"));
});

test("local Node builds leave session storage to the adapter", () => {
	const result = loadConfig({
		VERCEL: "0",
		KV_REST_API_URL: "",
		KV_REST_API_TOKEN: "",
	});
	assert.equal(result.status, 0, result.stderr);
	const config = JSON.parse(result.stdout);
	assert.equal(config.adapter, "@astrojs/node");
	assert.equal(config.session, null);
});

test("Vercel configuration fails explicitly without a KV REST URL", () => {
	const result = loadConfig({ KV_REST_API_URL: "" });
	assert.notEqual(result.status, 0);
	assert.match(result.stderr, /Missing required environment variable: KV_REST_API_URL/);
});

test("Vercel configuration fails explicitly without a KV REST token", () => {
	const result = loadConfig({ KV_REST_API_TOKEN: "" });
	assert.notEqual(result.status, 0);
	assert.match(result.stderr, /Missing required environment variable: KV_REST_API_TOKEN/);
});

test("runtime sessions use KV credentials and share writes and deletion across instances", () => {
	const result = runScript(`
		import assert from "node:assert/strict";
		const { default: createSessionDriver } = await import(${JSON.stringify(driverUrl)});
		const values = new Map();
		const commands = [];
		globalThis.fetch = async (url, options) => {
			assert.equal(new URL(url).origin, process.env.KV_REST_API_URL);
			assert.equal(new Headers(options.headers).get("authorization"), "Bearer test-session-token");
			const body = JSON.parse(options.body);
			const execute = (command) => {
				commands.push(command);
				const [operation, key, value] = command;
				switch (operation.toLowerCase()) {
					case "set":
						values.set(key, value);
						return { result: "OK" };
					case "get":
						return { result: values.get(key) ?? null };
					case "unlink":
						return { result: Number(values.delete(key)) };
					default:
						throw new Error("Unexpected Redis command: " + operation);
				}
			};
			return Response.json(Array.isArray(body[0]) ? body.map(execute) : execute(body));
		};
		const first = createSessionDriver();
		const second = createSessionDriver();
		const payload = '[{"user":1},{"id":"test-user"}]';
		await first.setItem("test-session", payload);
		assert.equal(await second.getItem("test-session"), payload);
		assert.equal(commands[0][1], "gawd-blog:sessions:test-session");
		await second.removeItem("test-session");
		assert.equal(await first.getItem("test-session"), null);
	`);
	assert.equal(result.status, 0, result.stderr);
});

test("runtime session creation fails explicitly when KV credentials are missing", () => {
	for (const name of ["KV_REST_API_URL", "KV_REST_API_TOKEN"]) {
		const result = runScript(`
			const { default: createSessionDriver } = await import(${JSON.stringify(driverUrl)});
			createSessionDriver();
		`, { [name]: "" });
		assert.notEqual(result.status, 0);
		assert.ok(result.stderr.includes(`Missing required environment variable: ${name}`));
	}
});
