'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usersApi } from '@/lib/api';
import toast from 'react-hot-toast';
import clsx from 'clsx';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const DEFAULT_WINDOWS = DAYS.map((_, i) => ({ dayOfWeek: i, startTime: '09:00', endTime: '17:00', enabled: false }));

export default function AvailabilityPage() {
  const qc = useQueryClient();
  const [exceptionDate, setExceptionDate] = useState('');
  const [exceptionAvail, setExceptionAvail] = useState(false);
  const [exceptionStart, setExceptionStart] = useState('09:00');
  const [exceptionEnd, setExceptionEnd] = useState('17:00');
  const [exceptionReason, setExceptionReason] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['my-availability'],
    queryFn: usersApi.getAvailability,
  });

  // Build editable windows state
  const [windows, setWindows] = useState<Array<{ dayOfWeek: number; startTime: string; endTime: string; enabled: boolean }> | null>(null);

  const effectiveWindows = windows || DAYS.map((_, i) => {
    const existing = data?.recurring?.find((r: any) => r.dayOfWeek === i);
    return { dayOfWeek: i, startTime: existing?.startTime || '09:00', endTime: existing?.endTime || '17:00', enabled: !!existing };
  });

  const saveMutation = useMutation({
    mutationFn: () => usersApi.setAvailability(effectiveWindows.filter(w => w.enabled).map(w => ({
      dayOfWeek: w.dayOfWeek, startTime: w.startTime, endTime: w.endTime,
    }))),
    onSuccess: () => { toast.success('Availability saved'); qc.invalidateQueries({ queryKey: ['my-availability'] }); },
    onError: () => toast.error('Failed to save'),
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
      toast.success('Exception added');
      qc.invalidateQueries({ queryKey: ['my-availability'] });
      setExceptionDate(''); setExceptionReason('');
    },
    onError: () => toast.error('Failed to add exception'),
  });

  const deleteException = useMutation({
    mutationFn: (id: string) => usersApi.deleteException(id),
    onSuccess: () => { toast.success('Exception removed'); qc.invalidateQueries({ queryKey: ['my-availability'] }); },
  });

  const updateWindow = (dayOfWeek: number, field: string, value: any) => {
    setWindows(prev => (prev || effectiveWindows).map(w =>
      w.dayOfWeek === dayOfWeek ? { ...w, [field]: value } : w
    ));
  };

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-7 h-7 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">My Availability</h1>
        <p className="text-sm text-gray-500 mt-1">
          Set your weekly availability windows. Times are in your local timezone; the system records them relative to each shift's location.
        </p>
      </div>

      {/* Weekly availability */}
      <div className="card p-5 mb-6">
        <h2 className="font-semibold text-gray-900 mb-4">Weekly Schedule</h2>
        <div className="space-y-3">
          {effectiveWindows.map((w) => (
            <div key={w.dayOfWeek} className={clsx(
              'flex items-center gap-3 p-3 rounded-lg transition-colors',
              w.enabled ? 'bg-brand-50' : 'bg-gray-50'
            )}>
              <input
                type="checkbox"
                checked={w.enabled}
                onChange={e => updateWindow(w.dayOfWeek, 'enabled', e.target.checked)}
                className="w-4 h-4 accent-brand-500"
              />
              <span className={clsx('text-sm font-medium w-24', w.enabled ? 'text-gray-900' : 'text-gray-400')}>
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
                  <span className="text-gray-400 text-sm">to</span>
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
        <button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          className="btn-primary mt-4"
        >
          {saveMutation.isPending ? 'Saving…' : 'Save Availability'}
        </button>
      </div>

      {/* One-off exceptions */}
      <div className="card p-5 mb-6">
        <h2 className="font-semibold text-gray-900 mb-4">Add Exception</h2>
        <p className="text-xs text-gray-500 mb-4">Override your recurring availability for a specific date.</p>
        <div className="space-y-3">
          <div>
            <label className="label">Date</label>
            <input type="date" className="input w-48" value={exceptionDate} onChange={e => setExceptionDate(e.target.value)} />
          </div>
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="exc-avail"
              checked={exceptionAvail}
              onChange={e => setExceptionAvail(e.target.checked)}
              className="w-4 h-4 accent-brand-500"
            />
            <label htmlFor="exc-avail" className="text-sm text-gray-700">Available on this date</label>
          </div>
          {exceptionAvail && (
            <div className="flex items-center gap-2">
              <input type="time" value={exceptionStart} onChange={e => setExceptionStart(e.target.value)} className="input w-32 text-sm" />
              <span className="text-gray-400 text-sm">to</span>
              <input type="time" value={exceptionEnd} onChange={e => setExceptionEnd(e.target.value)} className="input w-32 text-sm" />
            </div>
          )}
          <div>
            <label className="label">Reason (optional)</label>
            <input type="text" className="input" placeholder="e.g. Doctor's appointment, vacation…" value={exceptionReason} onChange={e => setExceptionReason(e.target.value)} />
          </div>
          <button
            onClick={() => addException.mutate()}
            disabled={!exceptionDate || addException.isPending}
            className="btn-primary btn-sm"
          >
            {addException.isPending ? 'Adding…' : 'Add Exception'}
          </button>
        </div>
      </div>

      {/* Existing exceptions */}
      {data?.exceptions?.length > 0 && (
        <div className="card p-5">
          <h2 className="font-semibold text-gray-900 mb-4">Existing Exceptions</h2>
          <div className="space-y-2">
            {data.exceptions.map((ex: any) => (
              <div key={ex.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <span className="text-sm font-medium text-gray-900">{ex.date}</span>
                  <span className={clsx('ml-2 badge', ex.isAvailable ? 'badge-green' : 'badge-red')}>
                    {ex.isAvailable ? `Available ${ex.startTime}–${ex.endTime}` : 'Unavailable'}
                  </span>
                  {ex.reason && <span className="text-xs text-gray-400 ml-2">{ex.reason}</span>}
                </div>
                <button
                  onClick={() => deleteException.mutate(ex.id)}
                  className="text-xs text-danger-500 hover:text-danger-700"
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
