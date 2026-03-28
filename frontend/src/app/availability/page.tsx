'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usersApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import toast from 'react-hot-toast';
import clsx from 'clsx';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

type Window = { dayOfWeek: number; startTime: string; endTime: string; enabled: boolean };

export default function AvailabilityPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [localWindows, setLocalWindows] = useState<Window[] | null>(null);
  const [exceptionDate, setExceptionDate] = useState('');
  const [exceptionAvail, setExceptionAvail] = useState(false);
  const [exceptionStart, setExceptionStart] = useState('09:00');
  const [exceptionEnd, setExceptionEnd] = useState('17:00');
  const [exceptionReason, setExceptionReason] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['my-availability'],
    queryFn: usersApi.getAvailability,
    enabled: !!user,
  });

  const effectiveWindows: Window[] = localWindows ?? DAYS.map((_, i) => {
    const existing = data?.recurring?.find((r: any) => r.dayOfWeek === i);
    return {
      dayOfWeek: i,
      startTime: existing?.startTime ?? '09:00',
      endTime: existing?.endTime ?? '17:00',
      enabled: !!existing,
    };
  });

  const saveMutation = useMutation({
    mutationFn: () => {
      const windows = effectiveWindows
        .filter(w => w.enabled)
        .map(w => ({ dayOfWeek: w.dayOfWeek, startTime: w.startTime, endTime: w.endTime }));
      return usersApi.setAvailability(windows);
    },
    onSuccess: () => {
      toast.success('Availability saved');
      setLocalWindows(null);
      qc.invalidateQueries({ queryKey: ['my-availability'] });
    },
    onError: (e: any) => {
      const msg = e.response?.data?.message;
      toast.error(Array.isArray(msg) ? msg.join(', ') : msg || 'Failed to save');
    },
  });

  const addException = useMutation({
    mutationFn: () => usersApi.setException({
      date: exceptionDate,
      isAvailable: exceptionAvail,
      startTime: exceptionAvail ? exceptionStart : undefined,
      endTime: exceptionAvail ? exceptionEnd : undefined,
      reason: exceptionReason || undefined,
    }),
    onSuccess: () => {
      toast.success('Exception saved');
      qc.invalidateQueries({ queryKey: ['my-availability'] });
      setExceptionDate('');
      setExceptionReason('');
      setExceptionAvail(false);
    },
    onError: (e: any) => {
      const msg = e.response?.data?.message;
      toast.error(Array.isArray(msg) ? msg.join(', ') : msg || 'Failed to save exception');
    },
  });

  const deleteException = useMutation({
    mutationFn: (id: string) => usersApi.deleteException(id),
    onSuccess: () => {
      toast.success('Exception removed');
      qc.invalidateQueries({ queryKey: ['my-availability'] });
    },
    onError: () => toast.error('Failed to remove exception'),
  });

  const updateWindow = (dayOfWeek: number, field: keyof Window, value: any) => {
    setLocalWindows((prev) => (prev ?? effectiveWindows).map(w =>
      w.dayOfWeek === dayOfWeek ? { ...w, [field]: value } : w
    ));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-7 h-7 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">My Availability</h1>
        <p className="text-sm text-gray-500 mt-1">
          Set which days and hours you are available to work. Managers use this when assigning shifts.
        </p>
      </div>

      {/* Weekly windows */}
      <div className="card p-5 mb-6">
        <h2 className="font-semibold text-gray-900 mb-4">Weekly Schedule</h2>
        <div className="space-y-2">
          {effectiveWindows.map((w) => (
            <div
              key={w.dayOfWeek}
              className={clsx(
                'flex items-center gap-3 p-3 rounded-lg border transition-colors',
                w.enabled ? 'bg-brand-50 border-brand-200' : 'bg-gray-50 border-transparent'
              )}
            >
              <input
                type="checkbox"
                checked={w.enabled}
                onChange={e => updateWindow(w.dayOfWeek, 'enabled', e.target.checked)}
                className="w-4 h-4 accent-brand-500 flex-shrink-0"
              />
              <span className={clsx('text-sm font-medium w-24 flex-shrink-0', w.enabled ? 'text-gray-900' : 'text-gray-400')}>
                {DAYS[w.dayOfWeek]}
              </span>
              {w.enabled ? (
                <div className="flex items-center gap-2 flex-1">
                  <input
                    type="time"
                    value={w.startTime}
                    onChange={e => updateWindow(w.dayOfWeek, 'startTime', e.target.value)}
                    className="input text-sm w-32"
                  />
                  <span className="text-gray-400 text-sm flex-shrink-0">to</span>
                  <input
                    type="time"
                    value={w.endTime}
                    onChange={e => updateWindow(w.dayOfWeek, 'endTime', e.target.value)}
                    className="input text-sm w-32"
                  />
                </div>
              ) : (
                <span className="text-sm text-gray-400">Unavailable</span>
              )}
            </div>
          ))}
        </div>
        <div className="flex items-center gap-3 mt-4">
          <button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="btn-primary"
          >
            {saveMutation.isPending ? 'Saving…' : 'Save Availability'}
          </button>
          {localWindows && (
            <button
              onClick={() => setLocalWindows(null)}
              className="btn-secondary text-sm"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Add exception */}
      <div className="card p-5 mb-6">
        <h2 className="font-semibold text-gray-900 mb-1">One-Off Exception</h2>
        <p className="text-xs text-gray-500 mb-4">Override your recurring schedule for a specific date (e.g. a day off or a late start).</p>
        <div className="space-y-3">
          <div>
            <label className="label">Date</label>
            <input
              type="date"
              className="input w-48"
              value={exceptionDate}
              onChange={e => setExceptionDate(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="exc-avail"
              checked={exceptionAvail}
              onChange={e => setExceptionAvail(e.target.checked)}
              className="w-4 h-4 accent-brand-500"
            />
            <label htmlFor="exc-avail" className="text-sm text-gray-700 cursor-pointer">
              I am available on this date (specific hours below)
            </label>
          </div>

          {exceptionAvail && (
            <div className="flex items-center gap-2 pl-7">
              <input type="time" value={exceptionStart} onChange={e => setExceptionStart(e.target.value)} className="input w-32 text-sm" />
              <span className="text-gray-400 text-sm">to</span>
              <input type="time" value={exceptionEnd} onChange={e => setExceptionEnd(e.target.value)} className="input w-32 text-sm" />
            </div>
          )}

          <div>
            <label className="label">Reason (optional)</label>
            <input
              type="text"
              className="input"
              placeholder="e.g. Holiday, appointment, personal day…"
              value={exceptionReason}
              onChange={e => setExceptionReason(e.target.value)}
            />
          </div>

          <button
            onClick={() => addException.mutate()}
            disabled={!exceptionDate || addException.isPending}
            className="btn-primary btn-sm"
          >
            {addException.isPending ? 'Saving…' : 'Save Exception'}
          </button>
        </div>
      </div>

      {/* Existing exceptions */}
      {(data?.exceptions?.length ?? 0) > 0 && (
        <div className="card p-5">
          <h2 className="font-semibold text-gray-900 mb-4">Saved Exceptions</h2>
          <div className="space-y-2">
            {data.exceptions.map((ex: any) => (
              <div key={ex.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-gray-900">{ex.date}</span>
                  <span className={clsx('badge text-xs', ex.isAvailable ? 'badge-green' : 'badge-red')}>
                    {ex.isAvailable
                      ? `Available ${ex.startTime ?? ''}${ex.endTime ? '–' + ex.endTime : ''}`
                      : 'Unavailable'}
                  </span>
                  {ex.reason && (
                    <span className="text-xs text-gray-400 italic">{ex.reason}</span>
                  )}
                </div>
                <button
                  onClick={() => deleteException.mutate(ex.id)}
                  disabled={deleteException.isPending}
                  className="text-xs text-danger-500 hover:text-danger-700 font-medium ml-2"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
