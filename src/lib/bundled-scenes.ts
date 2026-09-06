import type { SceneDetail } from '@/lib/api/scenes';
import { buildModelConfigFromSlots, getDefaultSceneSettings } from '@/lib/slot-materials/model-config';

export const SHOWCASE_MODEL_URL = '/models/mist-solitaire/ring.glb';
export const SHOWCASE_VIEWER_ID = 'mist-solitaire';

export function bundledScene(id: string): SceneDetail | null {
  if (id !== SHOWCASE_VIEWER_ID) return null;
  return {
    id: 0, name: 'MIST Solitaire', sku: null, category: 'Ring', note: null,
    model_key: 'models/mist-solitaire/ring.glb', model_url: SHOWCASE_MODEL_URL,
    material: 'platinum', lighting: 'studio',
    model_config: buildModelConfigFromSlots(['Metal 1','Gem 1']),
    slot_selections: { 'Metal 1': 'platinum', 'Gem 1': 'diamond' },
    scene_settings: getDefaultSceneSettings(), thumbnail_key: null, thumbnail_url: null,
    created_at: '', updated_at: '', renders: [],
  };
}
