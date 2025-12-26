/**
 * Transform Pipeline - Public API
 *
 * Usage:
 * ```typescript
 * import { BUILTIN_TRANSFORMS, executeTransform, getBuiltinsForType } from './lib/transforms';
 *
 * // Get transforms for YouTube transcripts
 * const transcriptTransforms = getBuiltinsForType('transcript');
 *
 * // Execute a transform
 * const result = await executeTransform(
 *   transcriptTransforms[0],
 *   { content: rawTranscript, title: 'My Video' },
 *   (progress) => console.log(progress.message)
 * );
 * ```
 */

// Types
export type {
  Transform,
  TransformInputType,
  TransformSettings,
  TransformCategory,
  TransformInput,
  TransformResult,
  TransformProgress,
  TransformProgressCallback,
  ItemTransforms,
  FeedTransformConfig,
} from './types';

// Built-in transforms
export {
  BUILTIN_TRANSFORMS,
  POLISH_TRANSCRIPT,
  SUMMARIZE_TRANSCRIPT,
  KEY_POINTS,
  EXTRACT_QUOTES,
  SUMMARIZE_ARTICLE,
  getBuiltinsForType,
  getBuiltinById,
} from './builtins';

// Executor
export {
  executeTransform,
  canRunTransform,
  estimateCost,
} from './executor';

// React Hook
export {
  useTransform,
  useItemTransforms,
  type UseTransformOptions,
  type UseTransformReturn,
} from './useTransform';
