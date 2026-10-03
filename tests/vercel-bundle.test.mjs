import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const functionsDirectory = fileURLToPath(
	new URL("../.vercel/output/functions/", import.meta.url),
);

test("Vercel functions load their handler and database dialect without workspace dependencies", async () => {
	const files = await readdir(functionsDirectory, { recursive: true });
	const manifests = files.filter((file) => basename(file) === ".vc-config.json");
	assert.ok(manifests.length > 0, "Build with the Vercel adapter before running this test");

	for (const manifest of manifests) {
		const functionDirectory = join(functionsDirectory, dirname(manifest));
		const config = JSON.parse(await readFile(join(functionsDirectory, manifest), "utf8"));
		assert.match(config.runtime, /^nodejs/);

		const isolatedDirectory = await mkdtemp(join(tmpdir(), "gawd-vercel-bundle-"));
		try {
			await cp(functionDirectory, isolatedDirectory, {
				recursive: true,
				verbatimSymlinks: true,
			});
			const result = spawnSync(process.execPath, ["--input-type=module", "--eval", `
				import assert from "node:assert/strict";
				import { lstat, realpath, readdir } from "node:fs/promises";
				import { basename, join, sep } from "node:path";
				import { pathToFileURL } from "node:url";
				const files = await readdir(".", { recursive: true });
				const root = await realpath(".");
				for (const file of files) {
					if ((await lstat(file)).isSymbolicLink()) {
						assert.ok((await realpath(file)).startsWith(root + sep),
							"Dependency symlink escapes the function: " + file);
					}
				}
				const dialects = files.filter((file) =>
					basename(file).startsWith("dialect_") && file.endsWith(".mjs"));
				assert.ok(dialects.length > 0, "Expected the EmDash database dialect chunk");
				for (const dialect of dialects) {
					await import(pathToFileURL(join(process.cwd(), dialect)).href);
				}
				await import(pathToFileURL(join(process.cwd(), ${JSON.stringify(config.handler)})).href);
			`], {
				cwd: isolatedDirectory,
				encoding: "utf8",
				env: { ...process.env, NODE_PATH: "" },
				timeout: 30_000,
			});
			assert.equal(result.status, 0, result.stderr || result.error?.message);
		} finally {
			await rm(isolatedDirectory, { recursive: true, force: true });
		}
	}
});
