import assert from "node:assert/strict";
import test from "node:test";
import { getArchiveRange, getPostPath } from "../src/utils/post-urls.ts";

test("post paths use the UTC publication date, not the creation date", () => {
	assert.equal(getPostPath({
		id: "a post",
		data: {
			publishedAt: new Date("2024-03-01T00:15:00+01:00"),
			createdAt: new Date("2026-10-01T00:00:00Z"),
		},
	}), "/2024/02/a%20post");
});

test("unpublished previews use the creation date", () => {
	assert.equal(getPostPath({
		id: "draft",
		data: { publishedAt: null, createdAt: new Date("2026-01-01T00:00:00Z") },
	}), "/2026/01/draft");
});

test("invalid post dates fail explicitly", () => {
	assert.throws(() => getPostPath({
		id: "broken",
		data: { publishedAt: new Date("invalid"), createdAt: new Date() },
	}), /Invalid publication date/);
});

test("year archives include the entire year", () => {
	assert.deepEqual(getArchiveRange("2024"), {
		gte: "2024-01-01T00:00:00.000Z",
		lte: "2024-12-31T23:59:59.999Z",
	});
});

test("month archives handle leap years and December rollover", () => {
	assert.deepEqual(getArchiveRange("2024", "02"), {
		gte: "2024-02-01T00:00:00.000Z",
		lte: "2024-02-29T23:59:59.999Z",
	});
	assert.deepEqual(getArchiveRange("2023", "02"), {
		gte: "2023-02-01T00:00:00.000Z",
		lte: "2023-02-28T23:59:59.999Z",
	});
	assert.deepEqual(getArchiveRange("2024", "12"), {
		gte: "2024-12-01T00:00:00.000Z",
		lte: "2024-12-31T23:59:59.999Z",
	});
});

test("archive validation rejects malformed years and non-canonical months", () => {
	for (const year of [undefined, "", "0000", "24", "02024", "about", "202x"]) {
		assert.equal(getArchiveRange(year), null);
	}
	for (const month of ["", "1", "00", "13", "001", "jan"]) {
		assert.equal(getArchiveRange("2024", month), null);
	}
});

test("four-digit years are not subject to Date.UTC's 1900 offset", () => {
	assert.equal(getArchiveRange("0099").gte, "0099-01-01T00:00:00.000Z");
	assert.equal(getArchiveRange("9999").lte, "9999-12-31T23:59:59.999Z");
});
