'use client';

import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Calendar, CheckCircle2, Loader2, Unlink } from 'lucide-react';

interface CalendarStatus {
  connected: boolean;
  account_email: string | null;
}

export function CalendarSettings() {
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [status, setStatus] = useState<CalendarStatus>({ connected: false, account_email: null });
  const [reminderMinutes, setReminderMinutes] = useState(2);
  const [isSavingCreds, setIsSavingCreds] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [credsSaved, setCredsSaved] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    invoke<CalendarStatus>('calendar_get_status')
      .then(setStatus)
      .catch(() => {});
    invoke<number>('calendar_get_reminder_minutes')
      .then(setReminderMinutes)
      .catch(() => {});
  }, []);

  const handleSaveCredentials = async () => {
    if (!clientId.trim() || !clientSecret.trim()) return;
    setIsSavingCreds(true);
    setErrorMessage(null);
    try {
      await invoke('calendar_save_credentials', {
        clientId: clientId.trim(),
        clientSecret: clientSecret.trim(),
      });
      setCredsSaved(true);
      setTimeout(() => setCredsSaved(false), 2500);
    } catch (e: any) {
      setErrorMessage(String(e));
    } finally {
      setIsSavingCreds(false);
    }
  };

  const handleConnect = async () => {
    setIsConnecting(true);
    setErrorMessage(null);
    try {
      const email = await invoke<string>('calendar_connect');
      setStatus({ connected: true, account_email: email });
    } catch (e: any) {
      setErrorMessage(String(e));
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    setIsDisconnecting(true);
    try {
      await invoke('calendar_disconnect');
      setStatus({ connected: false, account_email: null });
    } catch (e: any) {
      setErrorMessage(String(e));
    } finally {
      setIsDisconnecting(false);
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
          <h3 className="text-sm font-semibold text-gray-900">Google Calendar</h3>
          <p className="text-xs text-gray-500">Get recording prompts when meetings start</p>
        </div>
        {status.connected && (
          <span className="ml-auto flex items-center gap-1.5 text-xs text-green-600 font-medium">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Connected
          </span>
        )}
      </div>

      {status.connected ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-lg bg-green-50 border border-green-200 px-4 py-3">
            <span className="text-sm text-green-800 font-medium">
              {status.account_email ?? 'Connected'}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDisconnect}
              disabled={isDisconnecting}
              className="gap-1.5 text-gray-600 hover:text-red-600 border-gray-200"
            >
              {isDisconnecting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Unlink className="w-3.5 h-3.5" />
              )}
              Disconnect
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
          <div className="rounded-lg bg-gray-50 border border-gray-200 p-3 text-xs text-gray-600 space-y-1">
            <p className="font-medium text-gray-700">Setup instructions:</p>
            <ol className="list-decimal list-inside space-y-0.5 text-gray-600">
              <li>Go to Google Cloud Console and create an OAuth 2.0 Client ID</li>
              <li>Set application type to &quot;Desktop app&quot;</li>
              <li>Copy the Client ID and Client Secret below</li>
            </ol>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">Client ID</label>
              <Input
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                placeholder="xxxx.apps.googleusercontent.com"
                className="text-sm font-mono"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">Client Secret</label>
              <Input
                type="password"
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
                placeholder="GOCSPX-..."
                className="text-sm font-mono"
              />
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleSaveCredentials}
              disabled={isSavingCreds || !clientId.trim() || !clientSecret.trim()}
              className="gap-1.5"
            >
              {isSavingCreds ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : credsSaved ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
              ) : null}
              {credsSaved ? 'Saved!' : 'Save Credentials'}
            </Button>
            <Button
              size="sm"
              onClick={handleConnect}
              disabled={isConnecting}
              className="gap-1.5"
            >
              {isConnecting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Connecting…
                </>
              ) : (
                'Connect to Google Calendar'
              )}
            </Button>
          </div>

          {errorMessage && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
              {errorMessage}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
