export interface SceneCheckpoint { id: string; title: string; done: boolean; note: string }
export interface SceneTask { scene_id: string; title: string; assignee: string; status: string; brief: string; deliverables: string; checkpoints: SceneCheckpoint[]; revision: number; updated_at: string | null }
export function sceneTaskStore(args: {root: string; seedRoot?: string; getDeck: (id: string) => {slides: {id: string; label?: string}[]}}): {
 read: (deckId: string, slideId: string) => SceneTask;
 list: (deckId: string) => SceneTask[];
 put: (deckId: string, slideId: string, fields: Partial<SceneTask>, expectedRevision: number) => SceneTask;
 checkpoint: (deckId: string, slideId: string, checkpointId: string, patch: Partial<Pick<SceneCheckpoint,'done'|'note'>>) => SceneTask;
};
