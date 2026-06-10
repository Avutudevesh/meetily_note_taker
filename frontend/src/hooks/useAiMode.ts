'use client';

import { useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  scope: 'meeting' | 'all';
}

export function useAiMode() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const askQuestion = useCallback(async (
    meetingId: string,
    question: string,
    allMeetings: boolean = false,
  ) => {
    if (!question.trim()) return;
    if (!allMeetings && !meetingId) return;

    setIsLoading(true);
    setError(null);
    setMessages(prev => [...prev, { role: 'user', content: question, scope: allMeetings ? 'all' : 'meeting' }]);

    try {
      const answer = await invoke<string>('api_ask_question', {
        meetingId: allMeetings ? '' : meetingId,
        question,
        allMeetings,
      });
      setMessages(prev => [...prev, { role: 'assistant', content: answer, scope: allMeetings ? 'all' : 'meeting' }]);
    } catch (err) {
      const msg = typeof err === 'string' ? err : err instanceof Error ? err.message : 'Failed to get answer';
      setError(msg);
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${msg}`, scope: allMeetings ? 'all' : 'meeting' }]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  return { messages, isLoading, error, askQuestion, clearMessages };
}
