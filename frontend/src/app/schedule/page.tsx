'use client';
import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { shiftsApi, locationsApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useSocket } from '@/lib/socket';
import { format, addWeeks, subWeeks, startOfWeek, endOfWeek } from 'date-fns';
import { getWeekDays, formatShiftRange, formatWeekLabel } from '@/lib/dates';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { CreateShiftModal } from '@/components/shifts/CreateShiftModal';
import { ShiftDetailPanel } from '@/components/shifts/ShiftDetailPanel';

function SchedulePageInner() {
  const { user, token } = useAuth();
  const qc = useQueryClient();
  const searchParams = useSearchParams();
  const { on, joinLocation, leaveLocation } = useSocket(token);

  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [selectedLocation, setSelectedLocation] = useState(searchParams.get('locationId') || '');
  const [selectedShift, setSelectedShift] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
  const weekDays = getWeekDays(weekStart);

  const { data: locations = [] } = useQuery({
    queryKey: ['locations'],
    queryFn: locationsApi.list,
    enabled: !!user,
  });

  const { data: shifts = [], isLoading } = useQuery({
    queryKey: ['shifts', selectedLocation, weekStart.toISOString()],
    queryFn: () => shiftsApi.list({
      locationId: selectedLocation || undefined,
      weekStart: weekStart.toISOString(),
      weekEnd: weekEnd.toISOString(),
    }),
    enabled: !!user,
  });

  useEffect(() => {
    if (selectedLocation) {
      joinLocation(selectedLocation);
      return () => leaveLocation(selectedLocation);
    }
  }, [selectedLocation, joinLocation, leaveLocation]);

  useEffect(() => {
    const unsub = on('shift_updated', () => qc.invalidateQueries({ queryKey: ['shifts'] }));
    return unsub;
  }, [on, qc]);

  const publishWeek = useMutation({
    mutationFn: () => shiftsApi.publishWeek(selectedLocation, weekStart.toISOString()),
    onSuccess: (data: any) => {
      toast.success(`Published ${data.published} shift(s)`);
      qc.invalidateQueries({ queryKey: ['shifts'] });
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed to publish'),
  });

  const shiftsByDay = weekDays.map(day => ({
    day,
    shifts: (shifts as any[]).filter((s: any) => {
      const sd = new Date(s.startTime);
      return sd.getDate() === day.getDate() && sd.getMonth() === day.getMonth();
    }),
  }));

  const canManage = user?.role === 'admin' || user?.role === 'manager';

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-6 py-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-bold text-gray-900">Schedule</h1>
            <div className="flex items-center gap-1">
              <button onClick={() => setWeekStart(w => subWeeks(w, 1))} className="btn-secondary btn-sm px-2">‹</button>
              <span className="text-sm font-medium text-gray-700 min-w-[190px] text-center px-2">
                {formatWeekLabel(weekStart)}
              </span>
              <button onClick={() => setWeekStart(w => addWeeks(w, 1))} className="btn-secondary btn-sm px-2">›</button>
              <button
                onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}
                className="btn-secondary btn-sm text-xs ml-1"
              >
                Today
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <select
              className="input w-52 text-sm"
              value={selectedLocation}
              onChange={e => { setSelectedLocation(e.target.value); setSelectedShift(null); }}
            >
              <option value="">All locations</option>
              {(locations as any[]).map((l: any) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>

            {canManage && selectedLocation && (
              <>
                <button onClick={() => setShowCreateModal(true)} className="btn-primary btn-sm">+ New Shift</button>
                <button
                  onClick={() => publishWeek.mutate()}
                  disabled={publishWeek.isPending}
                  className="btn-secondary btn-sm"
                >
                  Publish Week
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Calendar */}
      <div className="flex-1 overflow-auto p-4">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-7 gap-2 min-w-[700px]">
            {/* Day headers */}
            {shiftsByDay.map(({ day }) => (
              <div key={day.toISOString()} className="text-center pb-2">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{format(day, 'EEE')}</p>
                <p className={clsx(
                  'text-lg font-bold mt-0.5 w-8 h-8 rounded-full flex items-center justify-center mx-auto',
                  day.toDateString() === new Date().toDateString()
                    ? 'bg-brand-500 text-white'
                    : 'text-gray-800'
                )}>
                  {format(day, 'd')}
                </p>
              </div>
            ))}

            {/* Shift cells */}
            {shiftsByDay.map(({ day, shifts: dayShifts }) => (
              <div
                key={day.toISOString()}
                className={clsx(
                  'min-h-[100px] rounded-xl p-1.5 space-y-1.5',
                  day.toDateString() === new Date().toDateString() ? 'bg-brand-50/40' : 'bg-gray-50/50'
                )}
              >
                {(dayShifts as any[]).map((shift: any) => (
                  <ShiftCard
                    key={shift.id}
                    shift={shift}
                    timezone={shift.location?.timezone || 'UTC'}
                    currentUserId={user?.id || ''}
                    onClick={() => setSelectedShift(shift.id === selectedShift ? null : shift.id)}
                    isSelected={selectedShift === shift.id}
                  />
                ))}
                {dayShifts.length === 0 && (
                  <div className="h-12 flex items-center justify-center">
                    <span className="text-xs text-gray-300">—</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Shift detail panel */}
      {selectedShift && (
        <ShiftDetailPanel
          shiftId={selectedShift}
          canManage={canManage}
          onClose={() => setSelectedShift(null)}
        />
      )}

      {/* Create shift modal */}
      {showCreateModal && (
        <CreateShiftModal
          locations={(locations as any[]).filter((l: any) => !selectedLocation || l.id === selectedLocation)}
          defaultLocationId={selectedLocation}
          defaultDate={weekStart}
          onClose={() => setShowCreateModal(false)}
          onCreated={() => {
            setShowCreateModal(false);
            qc.invalidateQueries({ queryKey: ['shifts'] });
          }}
        />
      )}
    </div>
  );
}

function ShiftCard({ shift, timezone, currentUserId, onClick, isSelected }: any) {
  const isMine = shift.assignments?.some((a: any) => a.userId === currentUserId);
  const isFull = shift.assignments?.length >= shift.headcount;

  return (
    <button
      onClick={onClick}
      className={clsx(
        'w-full text-left p-2 rounded-lg border text-xs transition-all',
        isSelected ? 'ring-2 ring-brand-500 border-brand-300 shadow-sm' : 'hover:shadow-sm',
        isMine ? 'bg-brand-100 border-brand-200' :
          !shift.isPublished ? 'bg-gray-100 border-gray-200 opacity-70' :
            isFull ? 'bg-green-50 border-green-200' :
              'bg-white border-gray-100 shadow-sm',
      )}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="font-semibold text-gray-800 capitalize truncate">{shift.requiredSkill}</span>
        {shift.isPremium && <span className="text-yellow-500 flex-shrink-0 text-[10px]">★</span>}
      </div>
      <p className="text-gray-500 mt-0.5 leading-tight text-[10px]">
        {formatShiftRange(shift.startTime, shift.endTime, timezone)}
      </p>
      <div className="flex items-center justify-between mt-1">
        <span className={clsx(
          'font-medium text-[10px]',
          isFull ? 'text-green-600' : 'text-gray-400'
        )}>
          {shift.assignments?.length}/{shift.headcount}
        </span>
        <div className="flex items-center gap-1">
          {!shift.isPublished && <span className="text-gray-400 text-[9px]">draft</span>}
          {isMine && <span className="text-brand-600 text-[9px] font-semibold">you</span>}
        </div>
      </div>
    </button>
  );
}

export default function SchedulePage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <SchedulePageInner />
    </Suspense>
  );
}
