import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { getPostPath } from "../src/utils/post-urls.ts";

const base = process.env.ROUTING_BASE_URL ?? "http://localhost:4321";
const db = new DatabaseSync(new URL("../data.db", import.meta.url).pathname, { readOnly: true });
const posts = db.prepare(`
	SELECT slug, published_at, created_at FROM ec_posts
	WHERE status = 'published' AND deleted_at IS NULL
	ORDER BY published_at DESC, id DESC
`).all().map((post) => ({
	id: post.slug,
	data: { publishedAt: new Date(post.published_at), createdAt: new Date(post.created_at) },
}));
const pages = db.prepare(`
	SELECT slug FROM ec_pages WHERE status = 'published' AND deleted_at IS NULL
`).all();
db.close();

assert.ok(posts.length > 0, "Route tests require a populated local database");
const postPaths = new Set(posts.map(getPostPath));
const groups = new Map();
for (const post of posts) {
	const path = getPostPath(post);
	const [, year, month] = path.split("/");
	for (const archivePath of [`/${year}`, `/${year}/${month}`]) {
		const entries = groups.get(archivePath) ?? [];
		entries.push(path);
		groups.set(archivePath, entries);
	}
}

async function page(path, status = 200) {
	const response = await fetch(new URL(path, base), { redirect: "manual" });
	assert.equal(response.status, status, `${path}: unexpected HTTP status`);
	assert.equal(response.headers.get("location"), null, `${path}: must not redirect`);
	return response.text();
}

function links(html) {
	return [...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);
}

function assertNoTemplateLinks(html) {
	assert.ok(!links(html).some((href) => /^\/(?:posts\/|pages\/|archives\/)/.test(href)),
		"Template detail/archive links must not appear");
}

test("homepage remains a latest-post listing with canonical post links", async () => {
	const html = await page("/");
	assertNoTemplateLinks(html);
	assert.ok(links(html).some((href) => postPaths.has(href)));
});

test("every imported published post is served at its dated permalink", async () => {
	for (const post of posts) {
		const path = getPostPath(post);
		const html = await page(path);
		assertNoTemplateLinks(html);
		assert.match(html, /class="article-grid"/);
		const canonical = html.match(/<link[^>]*rel="canonical"[^>]*href="([^"]+)"/)?.[1];
		assert.ok(canonical, `${path}: missing canonical`);
		assert.equal(new URL(canonical).pathname, path);
		for (const href of links(html).filter((href) => /^\/\d{4}(?:\/\d{2})?$/.test(href))) {
			assert.ok(groups.has(href), `Sidebar archive ${href} must contain posts`);
		}
	}
});

test("year and month archives contain every matching post, newest first", async () => {
	for (const [path, expected] of groups) {
		const html = await page(path);
		assertNoTemplateLinks(html);
		const actual = [...html.matchAll(/<a\s+href="([^"]+)"\s+class="card-link"/g)]
			.map((match) => match[1]);
		assert.deepEqual(actual, expected, `${path}: archive contents/order differ from the database`);
	}
});

test("published CMS pages are served from the root", async () => {
	for (const { slug } of pages) {
		if (/^\d{4}$/.test(slug) || ["posts", "search", "404"].includes(slug)) continue;
		const html = await page(`/${encodeURIComponent(slug)}`);
		assert.match(html, /class="page-article"/);
		assertNoTemplateLinks(html);
	}
});

test("empty archives, invalid dates and wrong post dates return real 404s", async () => {
	let emptyYear = 1900;
	while (groups.has(`/${emptyYear}`)) emptyYear++;
	const populatedYear = getPostPath(posts[0]).split("/")[1];
	const emptyMonth = Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, "0"))
		.find((month) => !groups.has(`/${populatedYear}/${month}`));
	const slug = encodeURIComponent(posts[0].id);
	for (const path of [
		`/${emptyYear}`, `/${emptyYear}/01`, `/${emptyYear}/01/${slug}`,
		"/0000", "/2026/00", "/2026/13", "/2026/1",
		"/not-a-year/01", "/2026/not-a-month", "/missing-cms-page",
		`/posts/${slug}`, "/pages/about",
	]) {
		await page(path, 404);
	}
	if (emptyMonth) await page(`/${populatedYear}/${emptyMonth}`, 404);
});

test("RSS, search, taxonomies and sitemap use the new post URLs", async () => {
	const rss = await page("/rss.xml");
	const rssLinks = [...rss.matchAll(/<guid isPermaLink="true">([^<]+)<\/guid>/g)]
		.map((match) => new URL(match[1]).pathname);
	assert.ok(rssLinks.length > 0);
	for (const path of rssLinks) assert.ok(postPaths.has(path), `RSS URL ${path}`);

	const sitemap = await page("/sitemap-posts.xml");
	const sitemapPaths = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)]
		.map((match) => new URL(match[1]).pathname);
	assert.deepEqual(new Set(sitemapPaths), postPaths);

	const pageSitemap = await page("/sitemap-pages.xml");
	for (const match of pageSitemap.matchAll(/<loc>([^<]+)<\/loc>/g)) {
		assert.ok(!new URL(match[1]).pathname.startsWith("/pages/"));
	}

	const article = await page(getPostPath(posts[0]));
	for (const path of [...new Set(links(article).filter((href) => /^\/(?:category|tag)\//.test(href)))].slice(0, 4)) {
		assertNoTemplateLinks(await page(path));
	}

	const search = await page("/search?q=anxiety");
	assertNoTemplateLinks(search);
	const resultLinks = [...search.matchAll(/<a\s+href="([^"]+)"\s+class="result-link"/g)]
		.map((match) => match[1]);
	assert.ok(resultLinks.length > 0, "The migrated database must contain the test search term");
	for (const path of resultLinks) assert.ok(postPaths.has(path), `Search URL ${path}`);
});
