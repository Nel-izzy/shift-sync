'use client';
import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { shiftsApi, locationsApi, usersApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useSocket } from '@/lib/socket';
import { format, addWeeks, subWeeks, startOfWeek, endOfWeek } from 'date-fns';
import { getWeekDays, formatShiftRange, formatWeekLabel, shiftDurationHours } from '@/lib/dates';
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

  const { data: locations = [] } = useQuery({ queryKey: ['locations'], queryFn: locationsApi.list });

  const { data: shifts = [], isLoading } = useQuery({
    queryKey: ['shifts', selectedLocation, weekStart.toISOString()],
    queryFn: () => shiftsApi.list({
      locationId: selectedLocation || undefined,
      weekStart: weekStart.toISOString(),
      weekEnd: weekEnd.toISOString(),
    }),
  });

  // Join location room for real-time
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
    onSuccess: (data) => {
      toast.success(`Published ${data.published} shift(s)`);
      qc.invalidateQueries({ queryKey: ['shifts'] });
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed to publish'),
  });

  const activeLocation = locations.find((l: any) => l.id === selectedLocation);

  // Group shifts by day
  const shiftsByDay = weekDays.map(day => ({
    day,
    shifts: shifts.filter((s: any) => {
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
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-bold text-gray-900">Schedule</h1>
            <div className="flex items-center gap-2">
              <button onClick={() => setWeekStart(w => subWeeks(w, 1))} className="btn-secondary btn-sm">
                ←
              </button>
              <span className="text-sm font-medium text-gray-700 min-w-[180px] text-center">
                {formatWeekLabel(weekStart)}
              </span>
              <button onClick={() => setWeekStart(w => addWeeks(w, 1))} className="btn-secondary btn-sm">
                →
              </button>
              <button onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))} className="btn-secondary btn-sm text-xs">
                Today
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <select
              className="input w-52"
              value={selectedLocation}
              onChange={e => setSelectedLocation(e.target.value)}
            >
              <option value="">All locations</option>
              {locations.map((l: any) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>

            {canManage && selectedLocation && (
              <>
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="btn-primary btn-sm"
                >
                  + New Shift
                </button>
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

      {/* Calendar grid */}
      <div className="flex-1 overflow-auto p-6">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-7 gap-3 min-w-[900px]">
            {/* Day headers */}
            {shiftsByDay.map(({ day }) => (
              <div key={day.toISOString()} className="text-center">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                  {format(day, 'EEE')}
                </p>
                <p className={clsx(
                  'text-lg font-bold mt-0.5',
                  day.toDateString() === new Date().toDateString() ? 'text-brand-500' : 'text-gray-900'
                )}>
                  {format(day, 'd')}
                </p>
              </div>
            ))}

            {/* Shift cells */}
            {shiftsByDay.map(({ day, shifts: dayShifts }) => (
              <div key={day.toISOString()} className={clsx(
                'min-h-[120px] rounded-xl p-1.5 space-y-1.5',
                day.toDateString() === new Date().toDateString() ? 'bg-brand-50/60' : 'bg-gray-50/50'
              )}>
                {dayShifts.map((shift: any) => (
                  <ShiftCard
                    key={shift.id}
                    shift={shift}
                    timezone={shift.location?.timezone || 'UTC'}
                    currentUserId={user?.id || ''}
                    onClick={() => setSelectedShift(shift.id)}
                    isSelected={selectedShift === shift.id}
                  />
                ))}
                {dayShifts.length === 0 && (
                  <div className="h-full min-h-[80px] flex items-center justify-center">
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
          locations={locations.filter((l: any) => !selectedLocation || l.id === selectedLocation)}
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
  const hasViolation = false;

  return (
    <button
      onClick={onClick}
      className={clsx(
        'w-full text-left p-2 rounded-lg border text-xs transition-all',
        isSelected ? 'ring-2 ring-brand-500 border-brand-300' : 'border-transparent',
        isMine ? 'bg-brand-100 hover:bg-brand-200' :
          !shift.isPublished ? 'bg-gray-100 hover:bg-gray-200 opacity-70' :
            isFull ? 'bg-green-50 hover:bg-green-100' :
              'bg-white hover:bg-gray-50 shadow-sm',
      )}
    >
      <div className="flex items-start justify-between gap-1">
        <span className="font-semibold text-gray-800 capitalize truncate">{shift.requiredSkill}</span>
        {shift.isPremium && <span className="text-yellow-500 flex-shrink-0">★</span>}
      </div>
      <p className="text-gray-500 mt-0.5 leading-tight">
        {formatShiftRange(shift.startTime, shift.endTime, timezone)}
      </p>
      <div className="flex items-center justify-between mt-1">
        <span className={clsx(
          'font-medium',
          isFull ? 'text-green-600' : shift.assignments?.length > 0 ? 'text-warning-700' : 'text-gray-400'
        )}>
          {shift.assignments?.length}/{shift.headcount}
        </span>
        {!shift.isPublished && <span className="text-gray-400 text-[10px]">draft</span>}
        {isMine && <span className="text-brand-600 text-[10px] font-medium">you</span>}
      </div>
    </button>
  );
}

export default function SchedulePage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" /></div>}>
      <SchedulePageInner />
    </Suspense>
  );
}
