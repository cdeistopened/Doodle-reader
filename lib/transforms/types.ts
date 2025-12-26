/**
 * Transform Pipeline - Type Definitions
 *
 * A Transform is a first-class object that represents an AI operation
 * on content. Instead of scattered handler functions, transforms are
 * declarative, composable, and persistable.
 */

// =============================================================================
// CORE TYPES
// =============================================================================

/**
 * What kind of content can a transform operate on?
 */
export type TransformInputType =
  | 'transcript'      // Raw transcript text (YouTube, podcast)
  | 'article'         // RSS article HTML/text
  | 'document'        // Scanned document
  | 'any';            // Works on anything with text

/**
 * A Transform is a reusable AI operation.
 */
export interface Transform {
  id: string;
  name: string;
  description?: string;

  /** The prompt template. Use {{content}} for input text, {{title}} for item title */
  prompt: string;

  /** What content types can this transform operate on? */
  inputTypes: TransformInputType[];

  /**
   * Where to store the result on the item.
   * Built-in field: 'aiSummary' (goes to item.aiSummary)
   * Or a custom key: stored in item.transforms[key]
   */
  outputField: string;

  /** Model settings */
  settings?: TransformSettings;

  /** Is this a system-provided transform or user-created? */
  isBuiltIn: boolean;

  /** Optional icon name for UI */
  icon?: string;

  /** Category for grouping in UI */
  category?: TransformCategory;

  /** When was this transform created/modified? */
  created?: string;
  modified?: string;
}

export interface TransformSettings {
  temperature?: number;      // 0.0 - 1.0, default varies by transform
  maxOutputTokens?: number;  // Limit response length
  model?: string;            // Override default model
}

export type TransformCategory =
  | 'summarize'    // Condensing content
  | 'extract'      // Pulling out specific things (quotes, key points)
  | 'polish'       // Cleaning up raw text
  | 'analyze'      // Deep analysis
  | 'custom';      // User-created

// =============================================================================
// EXECUTION TYPES
// =============================================================================

/**
 * Input to a transform execution
 */
export interface TransformInput {
  /** The main text to transform */
  content: string;

  /** Additional context */
  title?: string;
  sourceUrl?: string;
  author?: string;

  /**
   * Per-feed context prompt (e.g., speaker names, show format)
   * This gets injected into the prompt for better results
   */
  contextPrompt?: string;
}

/**
 * Result of a transform execution
 */
export interface TransformResult {
  /** The transform that was executed */
  transformId: string;

  /** The output text */
  output: string;

  /** When this ran */
  executedAt: string;

  /** How long it took (ms) */
  duration: number;

  /** Token usage if available */
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };

  /** Any error that occurred */
  error?: string;
}

/**
 * Progress callback during transform execution
 */
export interface TransformProgress {
  status: 'preparing' | 'executing' | 'completed' | 'error';
  message: string;
  progress?: number; // 0-100 if known
}

export type TransformProgressCallback = (progress: TransformProgress) => void;

// =============================================================================
// STORAGE TYPES
// =============================================================================

/**
 * How transforms are stored on an item.
 * Replaces the scattered aiSummary, polished, etc. fields
 */
export interface ItemTransforms {
  /** Results of transforms that have been run */
  results: Record<string, TransformResult>;

  /** Which transform was most recently run? */
  lastTransformId?: string;

  /**
   * Which transform result is currently "active" (displayed)?
   * Allows switching between different transform outputs
   */
  activeResultId?: string;
}

/**
 * Per-feed transform configuration
 */
export interface FeedTransformConfig {
  /** Transform to run automatically on new items */
  autoTransformId?: string;

  /** Show-specific context for all transforms on this feed */
  contextPrompt?: string;

  /** Preferred transforms for this feed (shown first in UI) */
  preferredTransformIds?: string[];
}
