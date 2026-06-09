'use client';

import { useState, KeyboardEvent } from 'react';
import { useSidebar } from '@/components/Sidebar/SidebarProvider';
import { useConfig } from '@/contexts/ConfigContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCategorize } from '@/hooks/categorize/useCategorize';
import { useCategoryGeneration } from '@/hooks/categorize/useCategoryGeneration';
import { X, ChevronDown, ChevronUp, Loader2, Tags, ArrowLeft, Copy, Check } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const TEMPLATE_LABELS: Record<string, string> = {
  category_update: 'Category Update',
  project_engagement_details: 'Project Engagement Details',
};

export default function CategorizePageContent() {
  const { meetings } = useSidebar();
  const { modelConfig } = useConfig();

  const {
    selectedMeetingIds,
    categories,
    assignments,
    step,
    isClassifying,
    handleToggleMeeting,
    handleAddCategory,
    handleRemoveCategory,
    handleRemoveExcerpt,
    handleClassify,
    goBackToSetup,
    goBackToReview,
    setStep,
  } = useCategorize();

  const { results, isGenerating, handleGenerate } = useCategoryGeneration();

  const [categoryInput, setCategoryInput] = useState('');
  const [expandedCategories, setExpandedCategories] = useState<Set<number>>(new Set());
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const handleCategoryInputKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && categoryInput.trim()) {
      handleAddCategory(categoryInput.trim());
      setCategoryInput('');
    }
  };

  const toggleExpanded = (index: number) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const meetingTitles = Object.fromEntries(meetings.map(m => [m.id, m.title]));

  const handleCopy = async (markdown: string, index: number) => {
    await navigator.clipboard.writeText(markdown);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  // ── Step 1: Setup ──────────────────────────────────────────────────────────
  if (step === 'setup') {
    return (
      <div className="flex flex-col h-full p-6 gap-6 overflow-y-auto">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Categorise & Summarise</h1>
          <p className="text-sm text-gray-500 mt-1">
            Select meetings, define categories, and let AI classify and summarise the content.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-6 flex-1">
          {/* Meeting selection */}
          <div className="flex flex-col gap-3">
            <h2 className="text-sm font-medium text-gray-700">
              Select Meetings
              {selectedMeetingIds.size > 0 && (
                <span className="ml-2 text-xs text-gray-400">({selectedMeetingIds.size} selected)</span>
              )}
            </h2>
            <div className="border border-gray-200 rounded-lg overflow-y-auto max-h-96 divide-y divide-gray-100">
              {meetings.length === 0 ? (
                <div className="p-4 text-sm text-gray-400 text-center">No meetings found</div>
              ) : (
                meetings.map(meeting => (
                  <label
                    key={meeting.id}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedMeetingIds.has(meeting.id)}
                      onChange={() => handleToggleMeeting(meeting.id)}
                      className="rounded border-gray-300 text-gray-900 focus:ring-gray-500"
                    />
                    <span className="text-sm text-gray-700 truncate">{meeting.title}</span>
                  </label>
                ))
              )}
            </div>
          </div>

          {/* Category input */}
          <div className="flex flex-col gap-3">
            <h2 className="text-sm font-medium text-gray-700">Define Categories</h2>
            <div className="flex gap-2">
              <Input
                value={categoryInput}
                onChange={e => setCategoryInput(e.target.value)}
                onKeyDown={handleCategoryInputKeyDown}
                placeholder="Type a category and press Enter"
                className="flex-1 text-sm"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (categoryInput.trim()) {
                    handleAddCategory(categoryInput.trim());
                    setCategoryInput('');
                  }
                }}
              >
                Add
              </Button>
            </div>

            {categories.length === 0 ? (
              <p className="text-sm text-gray-400">No categories yet — add one above.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {categories.map((cat, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1 bg-gray-100 text-gray-800 text-xs font-medium px-3 py-1.5 rounded-full"
                  >
                    {cat}
                    <button
                      onClick={() => handleRemoveCategory(i)}
                      className="ml-1 hover:text-red-500 transition-colors"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end pt-2 border-t border-gray-100">
          <Button
            onClick={() => handleClassify(meetingTitles, modelConfig.provider, modelConfig.model)}
            disabled={isClassifying || selectedMeetingIds.size === 0 || categories.length === 0}
            className="gap-2"
          >
            {isClassifying ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Classifying…
              </>
            ) : (
              <>
                <Tags className="w-4 h-4" />
                Classify
              </>
            )}
          </Button>
        </div>
      </div>
    );
  }

  // ── Step 2: Review ─────────────────────────────────────────────────────────
  if (step === 'review') {
    return (
      <div className="flex flex-col h-full p-6 gap-6 overflow-y-auto">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Review Assignments</h1>
            <p className="text-sm text-gray-500 mt-1">
              Remove any excerpts that don't belong, then generate summaries.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={goBackToSetup} className="gap-1">
            <ArrowLeft className="w-3.5 h-3.5" />
            Back
          </Button>
        </div>

        <div className="flex flex-col gap-3 flex-1">
          {assignments.map((assignment, ci) => (
            <div key={ci} className="border border-gray-200 rounded-lg overflow-hidden">
              <button
                onClick={() => toggleExpanded(ci)}
                className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
              >
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-gray-800">{assignment.category}</span>
                  <span className="text-xs text-gray-400">
                    {assignment.excerpts.length} excerpt{assignment.excerpts.length !== 1 ? 's' : ''}
                  </span>
                </div>
                {expandedCategories.has(ci) ? (
                  <ChevronUp className="w-4 h-4 text-gray-400" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-gray-400" />
                )}
              </button>

              {expandedCategories.has(ci) && (
                <div className="divide-y divide-gray-100">
                  {assignment.excerpts.length === 0 ? (
                    <p className="px-4 py-3 text-sm text-gray-400 italic">No excerpts assigned</p>
                  ) : (
                    assignment.excerpts.map((excerpt, ei) => (
                      <div key={ei} className="flex items-start gap-3 px-4 py-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-medium text-gray-500">{excerpt.meeting_title}</span>
                            <span className="text-xs text-gray-400 font-mono">{excerpt.timestamp}</span>
                          </div>
                          <p className="text-sm text-gray-700">{excerpt.text}</p>
                        </div>
                        <button
                          onClick={() => handleRemoveExcerpt(ci, ei)}
                          className="shrink-0 p-1 text-gray-300 hover:text-red-400 transition-colors"
                          title="Remove excerpt"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="flex justify-end pt-2 border-t border-gray-100">
          <Button
            onClick={() =>
              handleGenerate(assignments, modelConfig.provider, modelConfig.model, () =>
                setStep('results')
              )
            }
            disabled={isGenerating}
            className="gap-2"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Generating…
              </>
            ) : (
              'Generate Summaries'
            )}
          </Button>
        </div>
      </div>
    );
  }

  // ── Step 3: Results ────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full p-6 gap-6 overflow-y-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Summaries</h1>
          <p className="text-sm text-gray-500 mt-1">
            {results.length} categor{results.length !== 1 ? 'ies' : 'y'} summarised.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={goBackToReview} className="gap-1">
          <ArrowLeft className="w-3.5 h-3.5" />
          Back
        </Button>
      </div>

      <div className="flex flex-col gap-6">
        {results.map((result, i) => (
          <div key={i} className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200">
              <div className="flex items-center gap-3">
                <h2 className="text-sm font-semibold text-gray-800">{result.category}</h2>
                <span className="text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full font-medium">
                  {TEMPLATE_LABELS[result.template_used] ?? result.template_used}
                </span>
              </div>
              <button
                onClick={() => handleCopy(result.markdown, i)}
                className="p-1.5 text-gray-400 hover:text-gray-700 transition-colors"
                title="Copy markdown"
              >
                {copiedIndex === i ? (
                  <Check className="w-4 h-4 text-green-500" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </button>
            </div>
            <div className="px-4 py-4 prose prose-sm max-w-none text-gray-700">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{result.markdown}</ReactMarkdown>
            </div>
          </div>
        ))}
      </div>

      <div className="flex justify-end pt-2 border-t border-gray-100">
        <Button
          variant="outline"
          onClick={() => {
            setStep('setup');
          }}
        >
          Start Over
        </Button>
      </div>
    </div>
  );
}
