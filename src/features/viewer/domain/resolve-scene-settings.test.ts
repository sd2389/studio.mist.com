import { expect, it } from 'vitest';
import { resolveSceneSettings } from './resolve-scene-settings';
import { getDefaultSceneSettings } from '@/lib/slot-materials/model-config';

it('resolves catalog IDs without losing exposure, pose, transform, or custom background', () => {
  const settings = {...getDefaultSceneSettings(), 'ENVIRONMENT-METAL':'studio-id', advanced:{exposure:0,gemEnvRotation:45}, customBackground:'#abcdef', activePoseId:'front', modelTransform:{position:{x:1,y:0,z:0},rotation:{x:0,y:20,z:0}}};
  expect(resolveSceneSettings(settings,[{_id:'studio-id',value:'/hdr/studio.hdr'}])).toEqual({...settings,'ENVIRONMENT-METAL':'/hdr/studio.hdr'});
  expect(resolveSceneSettings(settings)).toBe(settings);
});
