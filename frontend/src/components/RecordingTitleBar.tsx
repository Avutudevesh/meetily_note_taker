'use client';

import { useState, useRef, useEffect } from 'react';
import { useRecordingState } from '@/contexts/RecordingStateContext';
import { useTranscripts } from '@/contexts/TranscriptContext';
import { recordingService } from '@/services/recordingService';
import { Pencil } from 'lucide-react';

export function RecordingTitleBar() {
  const { status } = useRecordingState();
  const { meetingTitle, setMeetingTitle } = useTranscripts();
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(meetingTitle);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  useEffect(() => {
    setEditValue(meetingTitle);
  }, [meetingTitle]);

  const handleStartEdit = () => {
    setEditValue(meetingTitle);
    setIsEditing(true);
  };

  const handleSave = async () => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== meetingTitle) {
      setMeetingTitle(trimmed);
      try {
        await recordingService.setRecordingMeetingName(trimmed);
      } catch (err) {
        console.warn('Failed to sync meeting name to backend:', err);
      }
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditValue(meetingTitle);
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      handleCancel();
    }
  };

  return (
    <div className="flex-shrink-0 bg-white border-b border-gray-200 h-12 flex items-center px-6 gap-3">
      <div className="flex items-center gap-2 min-w-0">
        <span className="relative flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
        </span>
        <span className="text-xs font-medium text-red-500 uppercase tracking-wider">
          Recording
        </span>
      </div>

      <div className="flex-1 min-w-0">
        {isEditing ? (
          <input
            ref={inputRef}
            type="text"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleSave}
            onKeyDown={handleKeyDown}
            className="w-full px-2 py-1 text-sm font-medium text-gray-900 bg-gray-50 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        ) : (
          <button
            onClick={handleStartEdit}
            className="flex items-center gap-1.5 group max-w-full"
          >
            <span className="text-sm font-medium text-gray-900 truncate">
              {meetingTitle}
            </span>
            <Pencil className="w-3.5 h-3.5 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
          </button>
        )}
      </div>
    </div>
  );
}
