'use client';

import { useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Transcript } from '@/types';
import { toast } from 'sonner';

export interface AssignedExcerpt {
  meeting_title: string;
  timestamp: string;
  text: string;
}

export interface CategoryAssignment {
  category: string;
  excerpts: AssignedExcerpt[];
}

export type CategorizeStep = 'setup' | 'review' | 'results';

export function useCategorize() {
  const [selectedMeetingIds, setSelectedMeetingIds] = useState<Set<string>>(new Set());
  const [categories, setCategories] = useState<string[]>([]);
  const [assignments, setAssignments] = useState<CategoryAssignment[]>([]);
  const [step, setStep] = useState<CategorizeStep>('setup');
  const [isClassifying, setIsClassifying] = useState(false);
  // null = AI chooses, string = forced template id
  const [templateOverrides, setTemplateOverrides] = useState<Record<number, string | null>>({});

  const handleSetTemplateOverride = useCallback((categoryIndex: number, templateId: string | null) => {
    setTemplateOverrides(prev => ({ ...prev, [categoryIndex]: templateId }));
  }, []);

  const handleToggleMeeting = useCallback((meetingId: string) => {
    setSelectedMeetingIds(prev => {
      const next = new Set(prev);
      if (next.has(meetingId)) {
        next.delete(meetingId);
      } else {
        next.add(meetingId);
      }
      return next;
    });
  }, []);

  const handleAddCategory = useCallback((category: string) => {
    const trimmed = category.trim();
    if (!trimmed) return;
    setCategories(prev => {
      if (prev.includes(trimmed)) return prev;
      return [...prev, trimmed];
    });
  }, []);

  const handleRemoveCategory = useCallback((index: number) => {
    setCategories(prev => prev.filter((_, i) => i !== index));
  }, []);

  const handleRemoveExcerpt = useCallback((categoryIndex: number, excerptIndex: number) => {
    setAssignments(prev =>
      prev.map((assignment, ci) => {
        if (ci !== categoryIndex) return assignment;
        return {
          ...assignment,
          excerpts: assignment.excerpts.filter((_, ei) => ei !== excerptIndex),
        };
      })
    );
  }, []);

  const handleMoveExcerpt = useCallback(
    (fromCategoryIndex: number, excerptIndex: number, toCategoryIndex: number) => {
      setAssignments(prev => {
        const excerpt = prev[fromCategoryIndex]?.excerpts[excerptIndex];
        if (!excerpt) return prev;
        return prev.map((assignment, ci) => {
          if (ci === fromCategoryIndex) {
            return {
              ...assignment,
              excerpts: assignment.excerpts.filter((_, ei) => ei !== excerptIndex),
            };
          }
          if (ci === toCategoryIndex) {
            return { ...assignment, excerpts: [...assignment.excerpts, excerpt] };
          }
          return assignment;
        });
      });
    },
    []
  );

  const fetchTranscriptsForMeeting = useCallback(async (meetingId: string): Promise<Transcript[]> => {
    const firstPage = await invoke<{ transcripts: Transcript[]; total_count: number }>('api_get_meeting_transcripts', {
      meetingId,
      limit: 1,
      offset: 0,
    });
    if (firstPage.total_count === 0) return [];
    const allData = await invoke<{ transcripts: Transcript[] }>('api_get_meeting_transcripts', {
      meetingId,
      limit: firstPage.total_count,
      offset: 0,
    });
    return allData.transcripts;
  }, []);

  const formatTranscript = useCallback((transcripts: Transcript[]): string => {
    const formatTime = (seconds: number | undefined, fallback: string): string => {
      if (seconds !== undefined && seconds >= 0) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `[${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}]`;
      }
      return `[${fallback}]`;
    };
    return transcripts
      .map(t => `${formatTime(t.audio_start_time, t.timestamp)} ${t.text}`)
      .join('\n');
  }, []);

  const handleClassify = useCallback(async (
    meetingTitles: Record<string, string>,
    model: string,
    modelName: string
  ) => {
    if (selectedMeetingIds.size === 0) {
      toast.error('Select at least one meeting');
      return;
    }
    if (categories.length === 0) {
      toast.error('Add at least one category');
      return;
    }

    setIsClassifying(true);
    try {
      const meetingTranscripts = await Promise.all(
        Array.from(selectedMeetingIds).map(async (id) => {
          const transcripts = await fetchTranscriptsForMeeting(id);
          return {
            meeting_id: id,
            meeting_title: meetingTitles[id] || id,
            formatted_text: formatTranscript(transcripts),
          };
        })
      );

      const filtered = meetingTranscripts.filter(m => m.formatted_text.trim().length > 0);
      if (filtered.length === 0) {
        toast.error('No transcript content found in the selected meetings');
        return;
      }

      const response = await invoke<{ assignments: CategoryAssignment[] }>('api_categorize_transcripts', {
        meetingTranscripts: filtered,
        categories,
        model,
        modelName,
      });

      setAssignments(response.assignments);
      setStep('review');
      toast.success('Classification complete — review the assignments below');
    } catch (error) {
      console.error('Categorisation error:', error);
      toast.error(`Classification failed: ${error}`);
    } finally {
      setIsClassifying(false);
    }
  }, [selectedMeetingIds, categories, fetchTranscriptsForMeeting, formatTranscript]);

  const goBackToSetup = useCallback(() => {
    setStep('setup');
  }, []);

  const goBackToReview = useCallback(() => {
    setStep('review');
  }, []);

  return {
    selectedMeetingIds,
    categories,
    assignments,
    step,
    isClassifying,
    handleToggleMeeting,
    handleAddCategory,
    handleRemoveCategory,
    handleRemoveExcerpt,
    handleMoveExcerpt,
    templateOverrides,
    handleSetTemplateOverride,
    handleClassify,
    goBackToSetup,
    goBackToReview,
    setStep,
  };
}
