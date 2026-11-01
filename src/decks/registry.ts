/**
 * Код сцен роликов. Данные ролика (deck.json) редактор берёт с сервера,
 * а сцены — отсюда: `src/decks/<id>/index.ts` экспортирует `SCENES: SceneDef[]`,
 * сцена привязывается к слайду по `id`. Слайды без сцены рисует заглушка движка.
 */

import type { SceneDef } from '../engine/types.ts';
import { scene3dDefinition, type Scene3DRecord } from '../engine/scene3d.ts';

const loaders = import.meta.glob<{ SCENES: SceneDef[] }>('./*/index.ts');

export async function loadScenes(deckId: string): Promise<Map<string, SceneDef>> {
  const load = loaders[`./${deckId}/index.ts`];
  const scenes = new Map<string, SceneDef>();
  if (load) {
    const mod = await load();
    for (const scene of mod.SCENES ?? []) scenes.set(scene.id, scene);
  }
  // Data-only 3D compositions can be published via MCP without deploying JS.
  // They explicitly override repository scene code for the matching slide only.
  try {
    const response = await fetch(`/api/decks/${encodeURIComponent(deckId)}/scene3d`);
    if (response.ok) {
      const authored = await response.json() as Scene3DRecord[];
      for (const record of authored) if (record.spec) {
        scenes.set(record.scene_id, scene3dDefinition(record.scene_id, record.spec));
      }
    } else if (response.status !== 404) {
      throw new Error('Unable to load 3D scene compositions: HTTP ' + response.status);
    }
  } catch (error) {
    // Keep built-in TypeScript scenes functional during temporary API failures.
    console.warn('[PressBuilder] 3D scene loader:', error);
  }
  return scenes;
}

// Сцену поправили (или Claude дописал новую) — редактор подхватывает код без
// перезагрузки страницы и не теряет ни позицию, ни выделение.
if (import.meta.hot) {
  import.meta.hot.accept((next) => {
    if (next) window.dispatchEvent(new CustomEvent('pb:scenes', { detail: next.loadScenes }));
  });
}
