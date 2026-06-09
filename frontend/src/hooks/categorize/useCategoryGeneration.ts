'use client';

import { useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';
import { CategoryAssignment } from './useCategorize';

export interface CategorySummaryResult {
  category: string;
  template_used: string;
  markdown: string;
}

export function useCategoryGeneration() {
  const [results, setResults] = useState<CategorySummaryResult[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerate = useCallback(async (
    assignments: CategoryAssignment[],
    model: string,
    modelName: string,
    onComplete: () => void,
  ) => {
    const nonEmpty = assignments.filter(a => a.excerpts.length > 0);
    if (nonEmpty.length === 0) {
      toast.error('No excerpts to summarise — add content to at least one category');
      return;
    }

    setIsGenerating(true);
    toast.info('Generating summaries…');
    try {
      const response = await invoke<{ results: CategorySummaryResult[] }>('api_generate_category_summaries', {
        assignments: nonEmpty,
        model,
        modelName,
      });

      setResults(response.results);
      onComplete();
      toast.success(`Generated ${response.results.length} categor${response.results.length === 1 ? 'y' : 'ies'} summary`);
    } catch (error) {
      console.error('Category generation error:', error);
      toast.error(`Generation failed: ${error}`);
    } finally {
      setIsGenerating(false);
    }
  }, []);

  return {
    results,
    isGenerating,
    handleGenerate,
  };
}
