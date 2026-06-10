'use client';

import { invoke } from '@tauri-apps/api/core';
import { Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

interface CalendarMeetingPopupProps {
  open: boolean;
  summary: string;
  minutesUntil: number;
  onClose: () => void;
}

export function CalendarMeetingPopup({
  open,
  summary,
  minutesUntil,
  onClose,
}: CalendarMeetingPopupProps) {
  const handleStartRecording = async () => {
    try {
      await invoke('start_recording_with_devices_and_meeting', {
        micDeviceName: null,
        systemDeviceName: null,
        meetingName: summary,
      });
      onClose();
    } catch (error) {
      console.error('[CalendarPopup] Failed to start recording:', error);
      onClose();
    }
  };

  const timeLabel =
    minutesUntil <= 0
      ? 'starting now'
      : minutesUntil === 1
      ? 'starting in 1 minute'
      : `starting in ${minutesUntil} minutes`;

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        className="sm:max-w-md"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <div className="flex items-center gap-3 mb-1">
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-blue-100">
              <Calendar className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <DialogTitle className="text-left">Meeting {timeLabel}</DialogTitle>
              <DialogDescription className="text-left mt-0.5">
                Would you like to start recording?
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="px-1 py-2 bg-gray-50 rounded-lg border border-gray-200">
          <p className="text-sm font-medium text-gray-900 truncate">{summary}</p>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={onClose} className="flex-1">
            Dismiss
          </Button>
          <Button onClick={handleStartRecording} className="flex-1">
            Start Recording
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
