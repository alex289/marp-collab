export type ProjectTemplate = {
	id: string;
	label: string;
	createMarkdown: (title: string, author: string) => string;
	/**
	 * Files copied from `assets/templates/<id>/<name>` into the new
	 * project's `theme/` folder.
	 */
	themeFiles: string[];
};
