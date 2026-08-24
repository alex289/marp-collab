import z from "zod";
import { PROJECT_TEMPLATE_IDS } from "../../../projects/templates/index.ts";

const projectNameSchema = z.string().trim().min(1).max(255);

const createProjectSchema = z.object({
	name: projectNameSchema,
	template: z.enum(PROJECT_TEMPLATE_IDS).default("default"),
});

const updateProjectSchema = z.object({
	name: projectNameSchema,
});

const importProjectSchema = z.object({
	name: projectNameSchema,
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

const gitConfigSchema = z.object({
	remoteUrl: z
		.string()
		.trim()
		.max(2048)
		.url()
		.refine((value) => {
			const url = new URL(value);
			return url.protocol === "https:" && !url.username && !url.password;
		}, "Remote URL must be HTTPS and must not contain credentials"),
	branch: z
		.string()
		.trim()
		.min(1)
		.max(255)
		.regex(/^[A-Za-z0-9][A-Za-z0-9._/-]*$/, "Invalid branch name")
		.refine(
			(value) =>
				value !== "HEAD" &&
				!value.includes("..") &&
				!value.includes("@{") &&
				!value.includes("//") &&
				!value.endsWith("/") &&
				!value.endsWith(".") &&
				!value.endsWith(".lock"),
		),
	username: z.string().trim().max(255).optional(),
	token: z.string().max(2048).optional(),
});

const gitPullSchema = z.object({
	resolutions: z.record(z.string().max(4096), z.enum(["project", "remote"])).optional(),
});

export {
	addCollaboratorSchema,
	createFileSchema,
	createFolderSchema,
	createProjectSchema,
	gitConfigSchema,
	gitPullSchema,
	importProjectSchema,
	moveFileSchema,
	renameEntrySchema,
	updateCollaboratorSchema,
	updateProjectSchema,
	uploadDestinationSchema,
};
