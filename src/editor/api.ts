/** Запросы редактора к дев-серверу (`server/plugin.ts`). */

import type { DeckData } from '../engine/types.ts';
import type { SceneTask, SceneCheckpoint } from '../../server/scene-tasks.mjs';
import type { ProjectReadme } from '../../server/project-readme.mjs';
import type { Scene3DRecord, Scene3DSpec } from '../engine/scene3d.ts';
export type { SceneTask, SceneCheckpoint, ProjectReadme };


export interface DeckMeta {
  id: string;
  title: string;
  slides: number;
  target: number | null;
  /** У ролика уже есть код сцен (src/decks/<id>/index.ts). */
  hasScenes: boolean;
  /** Пресет стиля (нет — Terevo). */
  style?: string;
  mtime: number;
}

export interface ServerConfig {
  ffmpeg: string;
  ffmpegOk: boolean;
}

/** Метка вкладки: сервер не присылает ей эхо её же сохранений. */
export const CLIENT_ID = Math.random().toString(36).slice(2);

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error((await res.text()) || `${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}

const body = (data: unknown): RequestInit => ({
  headers: { 'Content-Type': 'application/json', 'X-PB-Client': CLIENT_ID },
  body: JSON.stringify(data),
});

export const api = {
  listDecks: () => call<DeckMeta[]>('/api/decks'),
  getDeck: (id: string) => call<DeckData>(`/api/decks/${id}`),
  getScene3D: (id: string, slideId: string) => call<Scene3DRecord>(`/api/decks/${id}/scene3d/${slideId}`),
  saveScene3D: (id: string, slideId: string, spec: Scene3DSpec, expected_revision: number) =>
    call<Scene3DRecord>(`/api/decks/${id}/scene3d/${slideId}`,{
      method:'PUT',...body({spec,expected_revision})
    }),
  getProjectReadme: (id: string) => call<ProjectReadme>(`/api/decks/${id}/readme`),
  saveProjectReadme: (id: string, content: string, expected_revision: string) =>
    call<ProjectReadme>(`/api/decks/${id}/readme`,{
      method:'PUT',...body({content,expected_revision})
    }),
  listSceneTasks: (id: string) => call<SceneTask[]>(`/api/decks/${id}/tasks`),
  getSceneTask: (id: string, slideId: string) => call<SceneTask>(`/api/decks/${id}/tasks/${slideId}`),
  saveSceneTask: (id: string, slideId: string, task: Partial<SceneTask>, expected_revision: number) =>
    call<SceneTask>(`/api/decks/${id}/tasks/${slideId}`, {
      method: 'PUT', ...body({ ...task, expected_revision }),
    }),
  patchSceneCheckpoint: (id: string, slideId: string, checkpointId: string, patch: Partial<Pick<SceneCheckpoint, 'done' | 'note'>>) =>
    call<SceneTask>(`/api/decks/${id}/tasks/${slideId}/checkpoints/${checkpointId}`, {
      method: 'PATCH', ...body(patch),
    }),
  createDeck: (deck: DeckData) => call<{ ok: true }>('/api/decks', { method: 'POST', ...body(deck) }),
  saveDeck: (deck: DeckData, keepalive = false) =>
    call<{ ok: true }>(`/api/decks/${deck.id}`, { method: 'PUT', keepalive, ...body(deck) }),
  deleteDeck: (id: string) => call<{ ok: true }>(`/api/decks/${id}`, { method: 'DELETE' }),
  getConfig: () => call<ServerConfig>('/api/config'),
  setConfig: (cfg: { ffmpeg: string }) => call<ServerConfig>('/api/config', { method: 'PUT', ...body(cfg) }),
  /** Озвучка ролика: файл уходит в src/decks/<id>/voice.<ext>, в ответе — имя файла. */
  uploadAudio: (id: string, file: File) =>
    call<{ file: string; size: number }>(`/api/decks/${id}/audio?name=${encodeURIComponent(file.name)}`, {
      method: 'PUT',
      body: file,
    }),
  reveal: (file: string) => call<{ ok: true }>(`/api/reveal?file=${encodeURIComponent(file)}`, { method: 'POST' }),
};
