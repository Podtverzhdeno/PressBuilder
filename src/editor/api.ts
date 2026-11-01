/** Запросы редактора к дев-серверу (`server/plugin.ts`). */

import type { DeckData } from '../engine/types.ts';
import type { SceneTask, SceneCheckpoint } from '../../server/scene-tasks.mjs';
import type { ProjectReadme } from '../../server/project-readme.mjs';
import type { Scene3DRecord, Scene3DSpec } from '../engine/scene3d.ts';
export type { SceneTask, SceneCheckpoint, ProjectReadme };


export interface RhythmContext {
  project_id:string;
  voice_source_sha256:string;
  alignment_revision:string;
  timebase_revision:string;
  frame_rate:{num:number;den:number};
  duration_us:number;
  voice_verified:boolean;
  word_alignment_verified:boolean;
  cues:Array<{scene_id:string;cue_id:string;start_us:number;end_us:number}>;
  note:string;
}
export interface RhythmDraftRecord {
  schema_version:1;project_id:string;revision:number;
  status:'empty'|'submitted'|'endorsed_nonpublishable'|'rejected';
  proposal:null|{plan_sha256:string;voice_source_sha256:string;timebase_revision:string;
    cuts:Array<{id:string;frame:number;reason:string;cue_id:string|null}>;
    provenance:{word_alignment_verified:false;music_rights_verified:false}};
  author:null|{id:string;note:string;at:string};
  review:null|{reviewer_id:string;decision:'endorse'|'reject';note:string;at:string};
  source_state:'CURRENT'|'STALE'|'NOT_APPLICABLE';
  publication_allowed:false;
}
export interface RhythmPreview {
  schema_version:number;
  status:'REVIEW'|'READY_FOR_REVIEW';
  duration_frames:number;
  plan_sha256?:string;
  cuts:Array<{id:string;frame:number;cue_id:string|null;reason:string;confidence:string}>;
  discarded:Array<{frame:number;reason:string;violation:string}>;
  issues:string[];
  approved:boolean;
  persisted:boolean;
  publication_allowed:boolean;
  provenance:{voice_sha_verified:boolean;deck_clock_verified:boolean;
    word_alignment_verified:boolean;music_rights_verified:boolean;caller_markers_unverified:boolean};
}

export interface FrameEvidence {
  schema_version:number;scope:'FRAME_HEURISTICS_ONLY';verdict:'CAPTURED';
  frames:{index:number;t:number;frame:number;file:string;sha256:string;size:number;
    mean_luma:number;luma_stddev:number;warnings:string[]}[];
  differences:{from:number;to:number;mean_absolute_difference:number}[];
  warnings:string[];note:string;
}
export interface SceneRenderVersion {
  version_id:string; project:string; scene_id:string; created_at:string;
  file:string; sha256:string; size:number; duration:number; fps:number; height:number;
  qa:{verdict:string}; frame_evidence?:FrameEvidence; source:{fingerprint:string;scene3d_revision:number;style_revision:number};
}
export interface ApprovedScenePointer {revision:number;version_id:string|null;updated_at:string|null}
export interface SceneVersionList {versions:SceneRenderVersion[];approved:ApprovedScenePointer}
export interface SceneDraftPreview {
  id:string;slide_id:string;
  status:'queued'|'running'|'cancelling'|'completed'|'failed'|'cancelled'|'stale'|'not_started';
  job_id?:string;cache_hit?:boolean;source_fingerprint?:string;error?:string;
  width?:number;height?:number;wait_resource_ms?:number;
  timings_ms?:{prepare?:number;wait_resource?:number;chromium?:number;persist?:number;total?:number};
  render_timings_ms?:{browser_setup:number;capture_frames:number};
  process_metrics?:{scope:'PROCESS_DELTA_NOT_JOB_ISOLATED';cpu_user_ms:number;cpu_system_ms:number;
    rss_before_mb:number;rss_after_mb:number};
  frames?:{index:number;t:number;sha256:string;size:number;url:string}[];
}
export interface SceneVersionComparison {
  project:string;scene_id:string;from_version:string;to_version:string;
  scope:'PIXEL_DIFFERENCE_ONLY';samples:'P03_RELATIVE_10_50_90';
  resolution:{width:number;height:number};cache_hit:boolean;
  mean_absolute_difference:number;note:string;
  frames:{index:number;from_t:number;to_t:number;mean_absolute_difference:number;
    changed_fraction:number;before_url:string;after_url:string;difference_url:string}[];
}
export interface SceneReviewItem {
  id:string;version_id:string;t:number;frame:number;rect:{x:number;y:number;w:number;h:number}|null;
  text:string;severity:'low'|'medium'|'high'|'blocking';
  status:'OPEN'|'FIXED'|'VERIFIED'|'REOPENED';created_at:string;created_by:string;
  history:{status:string;at:string;actor:string;note?:string}[];
  has_frame_evidence?:boolean;frame_evidence?:string|null;
}
export interface SceneReviewRecord {project:string;scene_id:string;revision:number;items:SceneReviewItem[]}

export interface StyleContractRecord {
  id: string;
  revision: number;
  updated_at: string | null;
  contract: {
    schemaVersion: number;
    enforce: boolean;
    palette: string[];
    typography: {fonts:string[];minFontSize:number;maxTextLength:number};
    safeArea: {left:number;right:number;top:number;bottom:number};
    camera: {maxYawSpeed:number;maxPitchSpeed:number};
    motion: {maxSpin:number};
    transitions: {allowed:string[];maxDuration:number};
    sceneOverrides?:Record<string,unknown>;
  };
}
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
  getRhythmDraft: (id:string) =>
    call<RhythmDraftRecord>(`/api/decks/${encodeURIComponent(id)}/rhythm/draft`),
  submitRhythmDraft: (id:string,manifest:Record<string,unknown>,
    expected_revision:number,note:string) =>
    call<RhythmDraftRecord>(`/api/decks/${encodeURIComponent(id)}/rhythm/draft`,{
      method:'POST',...body({manifest,expected_revision,note})
    }),
  getRhythmContext: (id:string) =>
    call<RhythmContext>(`/api/decks/${encodeURIComponent(id)}/rhythm/context`),
  previewRhythm: (id:string,manifest:Record<string,unknown>) =>
    call<RhythmPreview>(`/api/decks/${encodeURIComponent(id)}/rhythm/preview`,{
      method:'POST',...body({manifest})
    }),
  getDeck: (id: string) => call<DeckData>(`/api/decks/${id}`),
  getScene3D: (id: string, slideId: string) => call<Scene3DRecord>(`/api/decks/${id}/scene3d/${slideId}`),
  saveScene3D: (id: string, slideId: string, spec: Scene3DSpec, expected_revision: number) =>
    call<Scene3DRecord>(`/api/decks/${id}/scene3d/${slideId}`,{
      method:'PUT',...body({spec,expected_revision})
    }),
  getSceneVersions: (id:string,scene:string) =>
    call<SceneVersionList>(`/api/decks/${id}/versions/${scene}`),
  startScenePreview: (id:string,scene:string) =>
    call<SceneDraftPreview>(`/api/decks/${encodeURIComponent(id)}/preview/${encodeURIComponent(scene)}`,{method:'POST'}),
  getScenePreview: (id:string,scene:string) =>
    call<SceneDraftPreview>(`/api/decks/${encodeURIComponent(id)}/preview/${encodeURIComponent(scene)}`),
  cancelScenePreview: (id:string,scene:string) =>
    call<SceneDraftPreview>(`/api/decks/${encodeURIComponent(id)}/preview/${encodeURIComponent(scene)}/cancel`,{method:'POST'}),
  compareSceneVersions: (id:string,scene:string,from:string,to:string) =>
    call<SceneVersionComparison>(`/api/decks/${encodeURIComponent(id)}/versions/${encodeURIComponent(scene)}/compare/${encodeURIComponent(from)}/${encodeURIComponent(to)}`),
  getSceneReviews: (id:string,scene:string) =>
    call<SceneReviewRecord>(`/api/decks/${id}/reviews/${scene}`),
  getSceneReviewItem: (id:string,scene:string,itemId:string) =>
    call<SceneReviewItem>(`/api/decks/${id}/reviews/${scene}/${itemId}`),
  addSceneReview: (id:string,scene:string,item:Pick<SceneReviewItem,'version_id'|'t'|'text'|'severity'|'rect'> & {frame_evidence?:string|null},expected_revision:number) =>
    call<{revision:number;item:SceneReviewItem}>(`/api/decks/${id}/reviews/${scene}`,{
      method:'POST',...body({item,expected_revision}),
    }),
  transitionSceneReview: (id:string,scene:string,itemId:string,status:'FIXED'|'VERIFIED'|'REOPENED',note:string,expected_revision:number) =>
    call<{revision:number;item:SceneReviewItem}>(`/api/decks/${id}/reviews/${scene}/${itemId}`,{
      method:'PATCH',...body({status,note,expected_revision}),
    }),
  setApprovedSceneVersion: (id:string,scene:string,version_id:string,expected_revision:number,action:'approve'|'restore') =>
    call<{revision:number;version_id:string}>(`/api/decks/${id}/versions/${scene}/${action}`,{
      method:'POST',...body({version_id,expected_revision}),
    }),
  getStyleContract: (id: string) => call<StyleContractRecord>('/api/decks/'+id+'/style-contract'),
  saveStyleContract: (id: string, contract: StyleContractRecord['contract'], expected_revision: number) =>
    call<StyleContractRecord>('/api/decks/'+id+'/style-contract',{
      method:'PUT',...body({contract,expected_revision})
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
