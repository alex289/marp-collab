export type ProjectFilesDragState = {
	draggingFileId: string | null;
	dragOverPath: string | null;
};

export const emptyProjectFilesDragState: ProjectFilesDragState = {
	draggingFileId: null,
	dragOverPath: null,
};

export function startProjectFileDrag(fileId: string): ProjectFilesDragState {
	return { draggingFileId: fileId, dragOverPath: null };
}

export function setProjectFileDragOver(
	state: ProjectFilesDragState,
	path: string | null,
): ProjectFilesDragState {
	return state.dragOverPath === path ? state : { ...state, dragOverPath: path };
}

export function endProjectFileDrag(): ProjectFilesDragState {
	return emptyProjectFilesDragState;
}
