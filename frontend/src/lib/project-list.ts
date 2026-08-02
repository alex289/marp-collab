export type ProjectSortOption = "created" | "updated" | "alphabetical";

type ProjectSortFields = {
	name: string;
	createdAt: Date | string;
	updatedAt: Date | string;
};

const projectNameCollator = new Intl.Collator(undefined, {
	numeric: true,
	sensitivity: "base",
});

function timestamp(value: Date | string) {
	const result = new Date(value).getTime();
	return Number.isNaN(result) ? 0 : result;
}

export function filterAndSortProjects<T>(
	projects: readonly T[],
	query: string,
	sortOption: ProjectSortOption,
	getFields: (project: T) => ProjectSortFields,
) {
	const normalizedQuery = query.trim().toLocaleLowerCase();

	return projects
		.filter((project) => getFields(project).name.toLocaleLowerCase().includes(normalizedQuery))
		.sort((left, right) => {
			const leftFields = getFields(left);
			const rightFields = getFields(right);
			const byName = projectNameCollator.compare(leftFields.name, rightFields.name);

			if (sortOption === "alphabetical") {
				return byName;
			}

			const leftDate = sortOption === "updated" ? leftFields.updatedAt : leftFields.createdAt;
			const rightDate = sortOption === "updated" ? rightFields.updatedAt : rightFields.createdAt;
			return timestamp(rightDate) - timestamp(leftDate) || byName;
		});
}
