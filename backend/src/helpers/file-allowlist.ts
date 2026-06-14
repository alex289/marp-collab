import { extname } from "node:path";

export const ALLOWED_ASSET_MIME_TYPES = new Set([
	"image/jpeg",
	"image/png",
	"image/gif",
	"image/webp",
	"image/svg+xml",
	"image/bmp",
	"image/tiff",
	"text/css",
]);

export const FONT_EXTENSIONS = new Set([".woff", ".woff2", ".ttf", ".otf"]);

export const ALLOWED_ASSET_EXTENSIONS = new Set([
	".jpg",
	".jpeg",
	".png",
	".gif",
	".webp",
	".svg",
	".bmp",
	".tiff",
	".css",
	".woff",
	".woff2",
	".ttf",
	".otf",
]);

export const MARKDOWN_EXTENSIONS = new Set([".md", ".markdown"]);

export const EDITABLE_EXTENSIONS = new Set([".md", ".markdown", ".css"]);

const EXTENSION_TO_MIME: Record<string, string> = {
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".png": "image/png",
	".gif": "image/gif",
	".webp": "image/webp",
	".svg": "image/svg+xml",
	".bmp": "image/bmp",
	".tiff": "image/tiff",
	".css": "text/css",
	".md": "text/markdown",
	".markdown": "text/markdown",
	".woff": "font/woff",
	".woff2": "font/woff2",
	".ttf": "font/ttf",
	".otf": "font/otf",
};

export function isAllowedUpload(filename: string, mimeType: string): boolean {
	const ext = extname(filename).toLowerCase();
	if (FONT_EXTENSIONS.has(ext)) {
		// Font MIME types are unreliable across browsers and operating systems
		// Some report a generic "application/octet-stream" MIME type, while others report
		// font/* or application/font-* or application/x-font-* MIME types.
		return true;
	}
	if (MARKDOWN_EXTENSIONS.has(ext)) {
		return mimeType === "text/markdown";
	}
	return ALLOWED_ASSET_EXTENSIONS.has(ext) && ALLOWED_ASSET_MIME_TYPES.has(mimeType);
}

export function getFileType(filename: string): "markdown" | "asset" | null {
	const ext = extname(filename).toLowerCase();
	if (EDITABLE_EXTENSIONS.has(ext)) {
		return "markdown";
	}
	if (ALLOWED_ASSET_EXTENSIONS.has(ext)) {
		return "asset";
	}
	return null;
}

export function isEditableExtension(filename: string): boolean {
	return EDITABLE_EXTENSIONS.has(extname(filename).toLowerCase());
}

export function getMimeType(filename: string): string {
	const ext = extname(filename).toLowerCase();
	return EXTENSION_TO_MIME[ext] ?? "application/octet-stream";
}
