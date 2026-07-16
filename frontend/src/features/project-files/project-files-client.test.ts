import assert from "node:assert/strict";
import test from "node:test";
import { API_URL } from "../../lib/config.ts";
import type { DeckFile } from "../../lib/types.ts";
import { createProjectFilesClient } from "./project-files-client.ts";

const deckFile = (id: string, type: DeckFile["type"] = "markdown"): DeckFile => ({
	id,
	label: id,
	type,
	...(type === "markdown" ? { documentName: `project/test/${id}` } : {}),
});

const parseJsonBody = (init: RequestInit | undefined): unknown => {
	const body = init?.body;
	if (typeof body !== "string") {
		assert.fail("Expected a JSON string request body");
	}
	return JSON.parse(body) as unknown;
};

test("lists project files from the existing endpoint", async () => {
	const calls: Array<[RequestInfo | URL, RequestInit | undefined]> = [];
	const client = createProjectFilesClient((input, init) => {
		calls.push([input, init]);
		return Promise.resolve(Response.json({ files: [deckFile("slides.md")] }));
	});

	assert.equal((await client.list("p1"))[0]?.id, "slides.md");
	assert.equal(calls[0]?.[0], `${API_URL}/projects/p1/files`);
});

test("creates files and folders with the unchanged JSON payloads", async () => {
	const calls: Array<[RequestInfo | URL, RequestInit | undefined]> = [];
	const client = createProjectFilesClient((input, init) => {
		calls.push([input, init]);
		return Promise.resolve(new Response(null, { status: 204 }));
	});

	await client.createFile("p1", "slides.md");
	await client.createFolder("p1", "assets");

	assert.deepEqual(calls, [
		[
			`${API_URL}/projects/p1/files`,
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name: "slides.md" }),
			},
		],
		[
			`${API_URL}/projects/p1/folders`,
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name: "assets" }),
			},
		],
	]);
});

test("uploads each file with the existing destination form field", async () => {
	let capturedInput: RequestInfo | URL | undefined;
	let capturedInit: RequestInit | undefined;
	const client = createProjectFilesClient((input, init) => {
		capturedInput = input;
		capturedInit = init;
		return Promise.resolve(new Response(null, { status: 204 }));
	});
	const file = new File(["# Slides"], "slides.md", { type: "text/markdown" });

	assert.deepEqual(await client.upload("p1", [file], "decks"), {
		uploadedAny: true,
		failures: [],
	});
	assert.equal(capturedInput, `${API_URL}/projects/p1/files/upload`);
	assert.equal(capturedInit?.method, "POST");
	const body = capturedInit?.body;
	if (!(body instanceof FormData)) {
		assert.fail("Expected a FormData request body");
	}
	assert.equal((body.get("file") as File).name, "slides.md");
	assert.equal(body.get("destination"), "decks");
});

test("keeps per-file upload failures instead of rejecting the batch", async () => {
	let call = 0;
	const client = createProjectFilesClient(() => {
		call += 1;
		if (call === 1) {
			return Promise.resolve(Response.json({ error: "Unsupported file" }, { status: 400 }));
		}
		return Promise.reject(new TypeError("network unavailable"));
	});

	assert.deepEqual(
		await client.upload("p1", [new File([""], "bad.exe"), new File([""], "offline.md")]),
		{
			uploadedAny: false,
			failures: ["bad.exe: Unsupported file", "offline.md: An unexpected error occurred"],
		},
	);
});

test("deletes files and folders through their unchanged endpoints", async () => {
	const calls: Array<[RequestInfo | URL, RequestInit | undefined]> = [];
	const client = createProjectFilesClient((input, init) => {
		calls.push([input, init]);
		return Promise.resolve(new Response(null, { status: 204 }));
	});

	await client.delete("p1", deckFile("nested/slides.md"));
	await client.delete("p1", deckFile("nested/assets", "folder"));

	assert.deepEqual(calls, [
		[`${API_URL}/projects/p1/files/nested%2Fslides.md`, { method: "DELETE" }],
		[`${API_URL}/projects/p1/folders/nested%2Fassets`, { method: "DELETE" }],
	]);
});

test("renames files and folders with their unchanged endpoints and payload", async () => {
	const calls: Array<[RequestInfo | URL, RequestInit | undefined]> = [];
	const responses = [
		Response.json({ newFileId: "nested/deck.md" }),
		Response.json({ newFolderPath: "nested/media" }),
	];
	const client = createProjectFilesClient((input, init) => {
		calls.push([input, init]);
		return Promise.resolve(responses.shift() ?? new Response(null, { status: 500 }));
	});

	assert.deepEqual(await client.rename("p1", deckFile("nested/slides.md"), "deck.md"), {
		type: "file",
		oldFileId: "nested/slides.md",
		newFileId: "nested/deck.md",
	});
	assert.deepEqual(await client.rename("p1", deckFile("nested/assets", "folder"), "media"), {
		type: "folder",
		oldFolderPath: "nested/assets",
		newFolderPath: "nested/media",
	});
	assert.deepEqual(
		calls.map(([input, init]) => [input, init?.method, parseJsonBody(init)]),
		[
			[`${API_URL}/projects/p1/files/rename/nested%2Fslides.md`, "PATCH", { name: "deck.md" }],
			[`${API_URL}/projects/p1/folders/nested%2Fassets/rename`, "PATCH", { name: "media" }],
		],
	);
});

test("moves a file with the unchanged PATCH payload", async () => {
	let captured: RequestInit | undefined;
	const client = createProjectFilesClient((_input, init) => {
		captured = init;
		return Promise.resolve(Response.json({ newFileId: "folder/slides.md" }));
	});

	assert.deepEqual(await client.move("p1", "slides.md", "folder"), {
		newFileId: "folder/slides.md",
	});
	assert.equal(captured?.method, "PATCH");
	assert.deepEqual(parseJsonBody(captured), { destination: "folder" });
});

test("preserves a backend error message", async () => {
	const client = createProjectFilesClient(() =>
		Promise.resolve(Response.json({ error: "Name already exists" }, { status: 409 })),
	);
	await assert.rejects(() => client.createFile("p1", "slides.md"), {
		name: "ProjectFilesRequestError",
		message: "Name already exists",
	});
});

test("falls back to the response text for non-JSON error bodies", async () => {
	const client = createProjectFilesClient(() =>
		Promise.resolve(new Response("Bad Gateway", { status: 502 })),
	);
	await assert.rejects(() => client.createFile("p1", "slides.md"), {
		name: "ProjectFilesRequestError",
		message: "Bad Gateway",
	});
});

test("falls back to the status code for empty error bodies", async () => {
	const client = createProjectFilesClient(() =>
		Promise.resolve(new Response(null, { status: 500 })),
	);
	await assert.rejects(() => client.createFile("p1", "slides.md"), {
		name: "ProjectFilesRequestError",
		message: "Failed to create file (HTTP 500)",
	});
});

test("encodes file URL segments without encoding path separators", () => {
	const client = createProjectFilesClient();
	assert.equal(
		client.fileUrl("p1", "nested/my deck.md"),
		`${API_URL}/projects/p1/files/nested/my%20deck.md`,
	);
	assert.equal(client.exportUrl("p1"), `${API_URL}/projects/p1/export.zip`);
});
