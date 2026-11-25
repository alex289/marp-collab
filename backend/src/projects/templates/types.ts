export type ProjectTemplate = {
	createMarkdown: (title: string, author: string) => string;
	/**
	 * Files copied from `assets/templates/<id>/<name>` into the new
	 * project's `theme/` folder.
	 */
	themeFiles: string[];
};
