'use client';

import { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useSidebar } from '@/components/Sidebar/SidebarProvider';
import { useAiMode, ChatMessage } from '@/hooks/useAiMode';
import { Bot, Send, Loader2, Trash2, MessageSquare, ChevronDown, Check } from 'lucide-react';

type Scope = 'meeting' | 'all';

export default function AiModePageContent() {
  const { currentMeeting, meetings } = useSidebar();
  const { messages, isLoading, error, askQuestion, clearMessages } = useAiMode();
  const [input, setInput] = useState('');
  const [scope, setScope] = useState<Scope>('meeting');
  const [showScopeMenu, setShowScopeMenu] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scopeRef = useRef<HTMLDivElement>(null);

  const selectedMeeting = meetings.find(m => m.id === currentMeeting?.id);
  const hasTranscripts = scope === 'all' ? meetings.length > 0 : !!selectedMeeting;

  // Close scope dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (scopeRef.current && !scopeRef.current.contains(e.target as Node)) {
        setShowScopeMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = async () => {
    if (!input.trim() || isLoading || !hasTranscripts) return;
    const question = input.trim();
    setInput('');
    await askQuestion(
      scope === 'all' ? '' : (currentMeeting?.id ?? ''),
      question,
      scope === 'all',
    );
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const scopeLabel = scope === 'all' ? 'All Meetings' : (selectedMeeting?.title ?? 'Select a meeting');
  const scopeIcon = scope === 'all' ? <MessageSquare className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-shrink-0 px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-100">
              <Bot className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-gray-900">AI Mode</h1>

              {/* Scope selector */}
              <div className="relative" ref={scopeRef}>
                <button
                  onClick={() => setShowScopeMenu(!showScopeMenu)}
                  className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 mt-0.5"
                >
                  {scopeIcon}
                  <span className="truncate max-w-[200px]">{scopeLabel}</span>
                  <ChevronDown className="w-3 h-3" />
                </button>

                {showScopeMenu && (
                  <div className="absolute left-0 top-full mt-1 w-56 bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-1">
                    <button
                      onClick={() => { setScope('all'); setShowScopeMenu(false); }}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-gray-50 ${scope === 'all' ? 'text-blue-600 font-medium' : 'text-gray-700'}`}
                    >
                      <div className="flex items-center justify-center w-5 h-5 rounded bg-blue-100">
                        <MessageSquare className="w-3 h-3 text-blue-600" />
                      </div>
                      <span className="flex-1">All Meetings</span>
                      {scope === 'all' && <Check className="w-3.5 h-3.5" />}
                    </button>
                    <div className="border-t border-gray-100 my-1" />
                    <div className="px-3 py-1 text-xs text-gray-400 font-medium">Individual Meetings</div>
                    {meetings.length === 0 ? (
                      <div className="px-3 py-2 text-xs text-gray-400 italic">No meetings yet</div>
                    ) : (
                      meetings.slice(0, 10).map(m => (
                        <button
                          key={m.id}
                          onClick={() => { setScope('meeting'); setShowScopeMenu(false); }}
                          className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-gray-50 ${scope === 'meeting' && currentMeeting?.id === m.id ? 'text-blue-600 font-medium' : 'text-gray-700'}`}
                        >
                          <div className="flex items-center justify-center w-5 h-5 rounded bg-gray-100">
                            <Bot className="w-3 h-3 text-gray-500" />
                          </div>
                          <span className="flex-1 truncate">{m.title}</span>
                          {scope === 'meeting' && currentMeeting?.id === m.id && <Check className="w-3.5 h-3.5" />}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
          {messages.length > 0 && (
            <button
              onClick={clearMessages}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="flex items-center justify-center w-16 h-16 rounded-full bg-blue-50 mb-4">
              <MessageSquare className="w-8 h-8 text-blue-400" />
            </div>
            {hasTranscripts ? (
              <>
                <p className="text-sm font-medium text-gray-700">
                  {scope === 'all' ? 'Ask across all meetings' : 'Ask about this meeting'}
                </p>
                <p className="text-xs text-gray-400 mt-1 max-w-sm">
                  {scope === 'all'
                    ? 'Ask questions across all meeting transcripts — find patterns, decisions, and more.'
                    : 'Ask questions about the transcript — summaries, action items, decisions, and more.'}
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-medium text-gray-700">No meeting selected</p>
                <p className="text-xs text-gray-400 mt-1 max-w-sm">
                  Select a meeting from the sidebar or switch to &quot;All Meetings&quot; mode, then ask questions about transcripts.
                </p>
              </>
            )}
          </div>
        ) : (
          messages.map((msg, i) => (
            <div
              key={i}
              className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {msg.role === 'assistant' && (
                <div className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 mt-1">
                  <Bot className="w-4 h-4 text-blue-600" />
                </div>
              )}
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-blue-600 text-white rounded-br-md'
                    : msg.content.startsWith('Error:')
                      ? 'bg-red-50 text-red-700 border border-red-200 rounded-bl-md'
                      : 'bg-gray-100 text-gray-800 rounded-bl-md'
                }`}
              >
                {msg.role === 'user' && msg.scope === 'all' && (
                  <div className="text-[10px] opacity-70 font-medium mb-1 uppercase tracking-wider">All Meetings</div>
                )}
                {msg.content}
              </div>
              {msg.role === 'user' && (
                <div className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-full bg-blue-600 mt-1">
                  <span className="text-xs font-medium text-white">U</span>
                </div>
              )}
            </div>
          ))
        )}
        {isLoading && (
          <div className="flex gap-3 justify-start">
            <div className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-full bg-blue-100">
              <Bot className="w-4 h-4 text-blue-600" />
            </div>
            <div className="bg-gray-100 rounded-2xl rounded-bl-md px-4 py-3">
              <div className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
                <span className="text-sm text-gray-500">Thinking...</span>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="flex-shrink-0 border-t border-gray-200 px-6 py-4">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              hasTranscripts
                ? scope === 'all'
                  ? 'Ask about all meetings...'
                  : 'Ask a question about this meeting...'
                : 'Select a meeting first...'
            }
            disabled={!hasTranscripts || isLoading}
            rows={1}
            className="flex-1 resize-none rounded-xl border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
            style={{ minHeight: '42px', maxHeight: '120px' }}
            onInput={e => {
              const el = e.currentTarget;
              el.style.height = 'auto';
              el.style.height = Math.min(el.scrollHeight, 120) + 'px';
            }}
          />
          <button
            onClick={handleSubmit}
            disabled={!input.trim() || isLoading || !hasTranscripts}
            className="flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="w-4 h-4 text-white" />
          </button>
        </div>
      </div>
    </div>
  );
}
