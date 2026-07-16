import z from "zod";

const createProjectSchema = z.object({
	name: z.string().trim().min(1).max(255),
});

const updateProjectSchema = z.object({
	name: z.string().trim().min(1).max(255),
});

const addCollaboratorSchema = z.object({
	email: z.string().trim().email(),
	readOnly: z.boolean().default(false),
});

const updateCollaboratorSchema = z.object({
	readOnly: z.boolean(),
});

const createFileSchema = z.object({
	name: z
		.string()
		.trim()
		.min(1)
		.max(255)
		.regex(
			/^[\w\-. /]+\.(md|markdown|css)$/,
			"File name must end in .md, .markdown, or .css and contain only letters, numbers, spaces, hyphens, underscores, dots, or slashes",
		)
		.refine((name) => !name.split("/").includes(".."), "Path traversal not allowed")
		.refine((name) => !name.startsWith("/"), "Absolute paths not allowed"),
});

const createFolderSchema = z.object({
	name: z
		.string()
		.trim()
		.min(1)
		.max(255)
		.regex(
			/^[\w\-. /]+$/,
			"Folder name must contain only letters, numbers, spaces, hyphens, underscores, dots, or slashes",
		)
		.refine((name) => !name.split("/").includes(".."), "Path traversal not allowed")
		.refine((name) => !name.startsWith("/"), "Absolute paths not allowed"),
});

const renameEntrySchema = z.object({
	name: z
		.string()
		.trim()
		.min(1)
		.max(255)
		.regex(
			/^[\w\-. ]+$/,
			"Name must contain only letters, numbers, spaces, hyphens, underscores, or dots",
		)
		.refine((name) => !name.includes("/"), "Slashes are not allowed when renaming")
		.refine((name) => !name.includes("\\"), "Backslashes are not allowed when renaming")
		.refine((name) => !name.includes(".."), "Path traversal not allowed"),
});

const uploadDestinationSchema = z
	.string()
	.max(255)
	.regex(
		/^[\w\-. /]*$/,
		"Upload destination must contain only letters, numbers, spaces, hyphens, underscores, dots, or slashes",
	)
	.refine((destination) => !destination.split("/").includes(".."), "Path traversal not allowed")
	.refine((destination) => !destination.startsWith("/"), "Absolute paths not allowed");

const moveFileSchema = z.object({
	destination: z
		.string()
		.max(255)
		.refine((d) => !d.split("/").includes(".."), "Path traversal not allowed")
		.refine((d) => !d.startsWith("/"), "Absolute paths not allowed"),
});

export {
	addCollaboratorSchema,
	createFileSchema,
	createFolderSchema,
	createProjectSchema,
	moveFileSchema,
	renameEntrySchema,
	updateCollaboratorSchema,
	updateProjectSchema,
	uploadDestinationSchema,
};
