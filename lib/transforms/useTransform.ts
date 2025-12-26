/**
 * useTransform Hook
 *
 * React hook for executing transforms with loading states and error handling.
 *
 * Usage:
 * ```tsx
 * const { execute, isExecuting, progress, error, result } = useTransform();
 *
 * const handlePolish = async () => {
 *   const result = await execute(POLISH_TRANSCRIPT, {
 *     content: rawTranscript,
 *     title: item.title,
 *   });
 *   if (result.output) {
 *     // Save result to storage
 *   }
 * };
 * ```
 */

import { useState, useCallback, useRef } from 'react';
import type {
  Transform,
  TransformInput,
  TransformResult,
  TransformProgress,
} from './types';
import { executeTransform } from './executor';

export interface UseTransformOptions {
  /** Callback when transform completes successfully */
  onSuccess?: (result: TransformResult) => void;
  /** Callback when transform fails */
  onError?: (error: string) => void;
}

export interface UseTransformReturn {
  /** Execute a transform */
  execute: (transform: Transform, input: TransformInput) => Promise<TransformResult>;

  /** Is a transform currently running? */
  isExecuting: boolean;

  /** Current progress (if executing) */
  progress: TransformProgress | null;

  /** Most recent error */
  error: string | null;

  /** Most recent result */
  result: TransformResult | null;

  /** Clear the current result/error */
  reset: () => void;
}

export function useTransform(options: UseTransformOptions = {}): UseTransformReturn {
  const [isExecuting, setIsExecuting] = useState(false);
  const [progress, setProgress] = useState<TransformProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TransformResult | null>(null);

  // Track current execution to prevent stale state updates
  const executionIdRef = useRef(0);

  const execute = useCallback(
    async (transform: Transform, input: TransformInput): Promise<TransformResult> => {
      const executionId = ++executionIdRef.current;

      setIsExecuting(true);
      setError(null);
      setProgress({ status: 'preparing', message: 'Starting...' });

      const transformResult = await executeTransform(transform, input, (p) => {
        // Only update if this is still the current execution
        if (executionId === executionIdRef.current) {
          setProgress(p);
        }
      });

      // Only update state if this is still the current execution
      if (executionId === executionIdRef.current) {
        setIsExecuting(false);
        setResult(transformResult);

        if (transformResult.error) {
          setError(transformResult.error);
          options.onError?.(transformResult.error);
        } else {
          options.onSuccess?.(transformResult);
        }
      }

      return transformResult;
    },
    [options]
  );

  const reset = useCallback(() => {
    setIsExecuting(false);
    setProgress(null);
    setError(null);
    setResult(null);
  }, []);

  return {
    execute,
    isExecuting,
    progress,
    error,
    result,
    reset,
  };
}

/**
 * Hook for managing multiple transform results for a single item.
 * Useful when you want to show different transform outputs (summary, key points, etc.)
 */
export function useItemTransforms(itemId: string) {
  const [results, setResults] = useState<Record<string, TransformResult>>({});
  const [activeResultId, setActiveResultId] = useState<string | null>(null);

  const addResult = useCallback((transformId: string, result: TransformResult) => {
    setResults((prev) => ({ ...prev, [transformId]: result }));
    setActiveResultId(transformId);
  }, []);

  const getResult = useCallback(
    (transformId: string) => results[transformId] || null,
    [results]
  );

  const activeResult = activeResultId ? results[activeResultId] : null;

  const clearResults = useCallback(() => {
    setResults({});
    setActiveResultId(null);
  }, []);

  return {
    results,
    activeResult,
    activeResultId,
    setActiveResultId,
    addResult,
    getResult,
    clearResults,
    hasResults: Object.keys(results).length > 0,
  };
}
