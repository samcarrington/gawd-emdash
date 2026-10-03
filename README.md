# EmDash Blog Template

A clean, minimal blog built with [EmDash](https://github.com/emdash-cms/emdash). Runs on any Node.js server with SQLite and local file storage.

![Blog template homepage](https://raw.githubusercontent.com/emdash-cms/emdash/main/assets/templates/blog/latest/homepage-light-desktop.jpg)

## What's Included

- Featured post hero on the homepage
- Post archive with reading time estimates
- Category and tag archives
- Full-text search
- RSS feed
- SEO metadata and JSON-LD
- Dark/light mode

## Pages

| Page | Route |
|---|---|
| Homepage | `/` |
| All posts | `/posts` |
| Single post | `/:year/:month/:slug` |
| Year archive | `/:year` |
| Month archive | `/:year/:month` |
| Category archive | `/category/:slug` |
| Tag archive | `/tag/:slug` |
| Search | `/search` |
| Static pages | `/:slug` |
| 404 | fallback |

Post URLs use the publication date in UTC and a zero-padded month (`/2026/05/post-slug`),
matching EmDash's date-based collection URL patterns. Unpublished previews use the
creation date until a publication date exists. Year and month archives list every
published post in the period, newest first, and return HTTP 404 when empty. A
post requested under the wrong year or month also returns HTTP 404.

Four-digit root paths are reserved for year archives. Existing utility routes
(`/posts`, `/search`, `/category`, `/tag`, and EmDash's internal routes) take
precedence over CMS page slugs. The temporary template detail URLs under
`/posts/:slug` and `/pages/:slug` are not retained.

For an existing database, set **Content Types → Posts → URL pattern** to
`/{year}/{month}/{slug}` and **Pages → URL pattern** to `/{slug}`, and update
custom menu links (for example, `/pages/about` becomes `/about`). Changing the
seed alone does not update an already-initialised CMS.

The site-side widget renderer preserves the built-in widget settings and classes
but uses the same dated post URLs and root archive URLs as the rest of the site.
This replaces EmDash's hard-coded `/posts/:slug` and `/archives/...` links.

## Routing checks

Run `pnpm test` for publication-date and archive-boundary tests. With `pnpm dev`
running against the local migrated database, run `pnpm test:routes` to check
post/page routes, complete archives, 404s, widgets, search, RSS and sitemaps.
Set `ROUTING_BASE_URL` to test another local port.

## Screenshots

| | Desktop | Mobile |
|---|---|---|
| Light | ![homepage light desktop](https://raw.githubusercontent.com/emdash-cms/emdash/main/assets/templates/blog/latest/homepage-light-desktop.jpg) | ![homepage light mobile](https://raw.githubusercontent.com/emdash-cms/emdash/main/assets/templates/blog/latest/homepage-light-mobile.jpg) |
| Dark | ![homepage dark desktop](https://raw.githubusercontent.com/emdash-cms/emdash/main/assets/templates/blog/latest/homepage-dark-desktop.jpg) | ![homepage dark mobile](https://raw.githubusercontent.com/emdash-cms/emdash/main/assets/templates/blog/latest/homepage-dark-mobile.jpg) |

## Infrastructure

- **Runtime:** Node.js locally or Vercel functions
- **Database:** SQLite locally, Turso on Vercel
- **Storage:** Local filesystem locally, S3-compatible storage on Vercel
- **Sessions:** Node adapter defaults locally, shared Upstash Redis on Vercel
- **Framework:** Astro with `@astrojs/node` or `@astrojs/vercel`

### Vercel database packaging

The Turso runtime declares `@libsql/kysely-libsql` and `@libsql/client` as direct
production dependencies. Relying only on EmDash's optional dependency can produce
a successful build whose Vercel function fails with `ERR_MODULE_NOT_FOUND`.
For Vercel only, the dialect is bundled and its client import is redirected to
`@libsql/client/web`, which supports remote Turso without native SQLite bindings.
Local Node builds continue using EmDash's standard SQLite adapter unchanged.

After building with the Vercel adapter (for example, `vercel build --prod`), run
`pnpm test:vercel` before deployment. This copies the generated functions into
temporary directories outside the workspace and imports their database dialect
and handler without access to the workspace's dependencies. It verifies runtime
packaging, not connectivity to Turso or authentication against Redis.

### Vercel admin sessions

The Vercel adapter does not provide an Astro session driver. EmDash requires one
for admin sign-in; per-function memory or filesystem storage is not a reliable
replacement for shared storage.

Create an Upstash Redis database and configure these secret environment variables
in Vercel before rebuilding:

- `KV_REST_API_URL`: the database's HTTPS REST endpoint supplied by the Vercel integration.
- `KV_REST_API_TOKEN`: the read-write REST token, not a read-only token.

Set both for the intended Production and Preview environments. Use separate
databases for Production and Preview so sessions cannot cross environments, and
do not use a `PUBLIC_` prefix or commit credentials.

The configuration checks that both variables exist during Vercel builds.
The session driver in `src/session-driver.ts` reads their values at runtime using
the Upstash Redis SDK; they are deliberately not
passed into the serialised driver configuration. Session keys use the
`gawd-blog:sessions` prefix. Local development and standalone Node builds do not
require Upstash and retain the Node adapter's default session driver.

After redeploying, verify admin sign-in, a subsequent authenticated request,
session persistence across a cold start, and sign-out. The configuration tests
in `pnpm test` exercise the driver with mocked Redis requests, but do not contact
a live Redis database or replace this deployed authentication check.

See [Astro sessions](https://docs.astro.build/en/guides/sessions/),
[the Upstash driver](https://unstorage.unjs.io/drivers/upstash), and
[EmDash session requirements](https://docs.emdashcms.com/deployment/secrets/#session-and-api-tokens).

## Getting Started

```bash
pnpm install
pnpm dev
```

Open http://localhost:4321/_emdash/admin and complete the setup wizard. EmDash runs database migrations and applies the blog seed during setup. The site is available at http://localhost:4321.

## Want Cloudflare Instead?

See the [Cloudflare variant](../blog-cloudflare) for a version that deploys to Cloudflare Workers with D1 and R2.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/emdash-cms/templates/tree/main/blog-cloudflare)

## See Also

- [All templates](../)
- [EmDash documentation](https://docs.emdashcms.com/)
