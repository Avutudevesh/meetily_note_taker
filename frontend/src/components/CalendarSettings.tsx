'use client';

import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Calendar, CheckCircle2, Loader2, Unlink, ExternalLink } from 'lucide-react';

interface CalendarStatus {
  connected: boolean;
  ics_url: string | null;
}

export function CalendarSettings() {
  const [icsUrl, setIcsUrl] = useState('');
  const [status, setStatus] = useState<CalendarStatus>({ connected: false, ics_url: null });
  const [reminderMinutes, setReminderMinutes] = useState(2);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    invoke<CalendarStatus>('calendar_get_status')
      .then(setStatus)
      .catch(() => {});
    invoke<number>('calendar_get_reminder_minutes')
      .then(setReminderMinutes)
      .catch(() => {});
  }, []);

  const handleSave = async () => {
    const url = icsUrl.trim();
    if (!url) return;
    setIsSaving(true);
    setErrorMessage(null);
    setTestResult(null);
    try {
      await invoke('calendar_save_ics_url', { icsUrl: url });
      setStatus({ connected: true, ics_url: url });
      setIcsUrl('');
    } catch (e: any) {
      setErrorMessage(String(e));
    } finally {
      setIsSaving(false);
    }
  };

  const handleTest = async () => {
    const url = icsUrl.trim();
    if (!url) return;
    setIsTesting(true);
    setTestResult(null);
    setErrorMessage(null);
    try {
      const count = await invoke<number>('calendar_test_ics_url', { icsUrl: url });
      setTestResult(`Found ${count} event${count !== 1 ? 's' : ''} — URL is valid`);
    } catch (e: any) {
      setErrorMessage(`Test failed: ${e}`);
    } finally {
      setIsTesting(false);
    }
  };

  const handleRemove = async () => {
    setIsRemoving(true);
    try {
      await invoke('calendar_remove_ics_url');
      setStatus({ connected: false, ics_url: null });
    } catch (e: any) {
      setErrorMessage(String(e));
    } finally {
      setIsRemoving(false);
    }
  };

  const handleReminderChange = async (value: number) => {
    const clamped = Math.min(15, Math.max(1, value));
    setReminderMinutes(clamped);
    try {
      await invoke('calendar_set_reminder_minutes', { minutes: clamped });
    } catch {
      // non-critical
    }
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-5">
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-blue-50">
          <Calendar className="w-5 h-5 text-blue-600" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Calendar Integration</h3>
          <p className="text-xs text-gray-500">Get a recording prompt when meetings start</p>
        </div>
        {status.connected && (
          <span className="ml-auto flex items-center gap-1.5 text-xs text-green-600 font-medium">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Active
          </span>
        )}
      </div>

      {status.connected ? (
        <div className="space-y-4">
          <div className="flex items-start justify-between rounded-lg bg-green-50 border border-green-200 px-4 py-3 gap-3">
            <p className="text-xs text-green-800 font-mono break-all leading-relaxed">
              {status.ics_url}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRemove}
              disabled={isRemoving}
              className="shrink-0 gap-1.5 text-gray-600 hover:text-red-600 border-gray-200"
            >
              {isRemoving ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Unlink className="w-3.5 h-3.5" />
              )}
              Remove
            </Button>
          </div>

          <div className="flex items-center gap-3">
            <label className="text-sm text-gray-700 shrink-0">Remind me</label>
            <Input
              type="number"
              min={1}
              max={15}
              value={reminderMinutes}
              onChange={(e) => handleReminderChange(Number(e.target.value))}
              className="w-20 text-sm"
            />
            <span className="text-sm text-gray-500 shrink-0">minutes before meeting starts</span>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Instructions */}
          <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 space-y-2">
            <p className="text-xs font-medium text-blue-900">How to get your calendar URL:</p>
            <ol className="text-xs text-blue-800 list-decimal list-inside space-y-1">
              <li>Open <span className="font-medium">Google Calendar</span> in your browser</li>
              <li>Click the three dots next to a calendar → <span className="font-medium">Settings</span></li>
              <li>Scroll to <span className="font-medium">"Integrate calendar"</span></li>
              <li>Copy the <span className="font-medium">"Secret address in iCal format"</span></li>
            </ol>
            <p className="text-xs text-blue-700 mt-1">
              Works with Google Calendar, Apple Calendar, Outlook, or any calendar with an iCal/ICS URL.
            </p>
          </div>

          {/* URL input */}
          <div>
            <label className="text-xs font-medium text-gray-700 mb-1.5 block">
              Calendar iCal / ICS URL
            </label>
            <Input
              value={icsUrl}
              onChange={(e) => {
                setIcsUrl(e.target.value);
                setTestResult(null);
                setErrorMessage(null);
              }}
              placeholder="https://calendar.google.com/calendar/ical/..."
              className="text-sm font-mono"
            />
          </div>

          {testResult && (
            <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">
              {testResult}
            </p>
          )}
          {errorMessage && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
              {errorMessage}
            </p>
          )}

          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleTest}
              disabled={isTesting || !icsUrl.trim()}
              className="gap-1.5"
            >
              {isTesting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              Test URL
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={isSaving || !icsUrl.trim()}
              className="gap-1.5"
            >
              {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              Save & Enable
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
