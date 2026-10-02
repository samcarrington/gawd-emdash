export function getPostPath(post: {
	id: string;
	data: { publishedAt: Date | null; createdAt: Date };
}): string {
	const date = post.data.publishedAt ?? post.data.createdAt;
	if (Number.isNaN(date.getTime())) {
		throw new Error(`Invalid publication date for post "${post.id}"`);
	}
	const year = String(date.getUTCFullYear()).padStart(4, "0");
	const month = String(date.getUTCMonth() + 1).padStart(2, "0");
	return `/${year}/${month}/${encodeURIComponent(post.id)}`;
}

export function getArchiveRange(year: string | undefined, month?: string) {
	if (!year || !/^\d{4}$/.test(year) || Number(year) === 0) return null;
	if (month !== undefined && !/^(0[1-9]|1[0-2])$/.test(month)) return null;

	const start = new Date(`${year}-${month ?? "01"}-01T00:00:00.000Z`);
	const end = new Date(start);
	end.setUTCMonth(end.getUTCMonth() + (month === undefined ? 12 : 1));
	end.setTime(end.getTime() - 1);
	return { gte: start.toISOString(), lte: end.toISOString() };
}
