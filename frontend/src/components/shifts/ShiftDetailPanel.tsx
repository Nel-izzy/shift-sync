'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { shiftsApi, locationsApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { format } from 'date-fns';
import { formatShiftRange, shiftDurationHours } from '@/lib/dates';
import toast from 'react-hot-toast';
import clsx from 'clsx';

interface Props {
  shiftId: string;
  canManage: boolean;
  onClose: () => void;
}

export function ShiftDetailPanel({ shiftId, canManage, onClose }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [checkUserId, setCheckUserId] = useState('');
  const [checkResult, setCheckResult] = useState<any>(null);
  const [checking, setChecking] = useState(false);

  const { data: shift, isLoading } = useQuery({
    queryKey: ['shift', shiftId],
    queryFn: () => shiftsApi.get(shiftId),
  });

  const { data: locationStaff = [] } = useQuery({
    queryKey: ['location-staff', shift?.locationId],
    queryFn: () => locationsApi.getStaff(shift?.locationId),
    enabled: !!shift?.locationId && canManage,
  });

  const assignMutation = useMutation({
    mutationFn: (userId: string) => shiftsApi.assign(shiftId, userId),
    onSuccess: (data) => {
      toast.success('Staff assigned');
      if (data.warnings?.length) {
        data.warnings.forEach((w: any) => toast(w.message, { icon: '⚠️' }));
      }
      qc.invalidateQueries({ queryKey: ['shift', shiftId] });
      qc.invalidateQueries({ queryKey: ['shifts'] });
    },
    onError: (e: any) => {
      const err = e.response?.data;
      if (err?.violations) {
        err.violations.forEach((v: any) => toast.error(v.message));
        if (err.alternatives?.length) {
          toast(`Alternatives: ${err.alternatives.map((a: any) => a.name).join(', ')}`, { icon: '💡', duration: 6000 });
        }
      } else {
        toast.error(err?.message || 'Assignment failed');
      }
    },
  });

  const unassignMutation = useMutation({
    mutationFn: (userId: string) => shiftsApi.unassign(shiftId, userId),
    onSuccess: () => {
      toast.success('Staff removed');
      qc.invalidateQueries({ queryKey: ['shift', shiftId] });
      qc.invalidateQueries({ queryKey: ['shifts'] });
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed to remove'),
  });

  const publishMutation = useMutation({
    mutationFn: () => shiftsApi.publish(shiftId),
    onSuccess: () => {
      toast.success('Shift published');
      qc.invalidateQueries({ queryKey: ['shift', shiftId] });
      qc.invalidateQueries({ queryKey: ['shifts'] });
    },
  });

  const unpublishMutation = useMutation({
    mutationFn: () => shiftsApi.unpublish(shiftId),
    onSuccess: () => {
      toast.success('Shift unpublished');
      qc.invalidateQueries({ queryKey: ['shift', shiftId] });
      qc.invalidateQueries({ queryKey: ['shifts'] });
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Cannot unpublish (48h cutoff)'),
  });

  const handleCheck = async () => {
    if (!checkUserId) return;
    setChecking(true);
    try {
      const result = await shiftsApi.checkAssignment(shiftId, checkUserId);
      setCheckResult(result);
    } catch {
      toast.error('Check failed');
    } finally {
      setChecking(false);
    }
  };

  const unassignedStaff = locationStaff.filter(
    (s: any) => !shift?.assignments?.some((a: any) => a.userId === s.id)
  );

  if (isLoading) return null;
  if (!shift) return null;

  const tz = shift.location?.timezone || 'UTC';
  const hours = shiftDurationHours(shift.startTime, shift.endTime);

  return (
    <div className="fixed inset-y-0 right-0 w-96 bg-white shadow-2xl border-l border-gray-100 flex flex-col z-50">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <div>
          <h2 className="font-semibold text-gray-900 capitalize">{shift.requiredSkill} Shift</h2>
          <p className="text-xs text-gray-500">{shift.location?.name}</p>
        </div>
        <div className="flex items-center gap-2">
          {shift.isPremium && <span className="badge-yellow">★ Premium</span>}
          <span className={clsx('badge', shift.isPublished ? 'badge-green' : 'badge-gray')}>
            {shift.isPublished ? 'Published' : 'Draft'}
          </span>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 ml-2">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {/* Shift info */}
        <div className="space-y-2">
          <InfoRow label="Date" value={format(new Date(shift.startTime), 'EEEE, MMMM d, yyyy')} />
          <InfoRow label="Time" value={formatShiftRange(shift.startTime, shift.endTime, tz)} />
          <InfoRow label="Duration" value={`${hours}h`} />
          <InfoRow label="Timezone" value={tz} />
          <InfoRow label="Headcount" value={`${shift.assignments?.length}/${shift.headcount}`} />
          {shift.notes && <InfoRow label="Notes" value={shift.notes} />}
        </div>

        {/* Current assignments */}
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Assigned Staff</h3>
          {shift.assignments?.length === 0 ? (
            <p className="text-sm text-gray-400 py-2">No staff assigned yet</p>
          ) : (
            <div className="space-y-2">
              {shift.assignments.map((a: any) => (
                <div key={a.id} className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
                  <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 text-xs font-bold flex-shrink-0">
                    {a.firstName[0]}{a.lastName[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">{a.firstName} {a.lastName}</p>
                  </div>
                  {canManage && (
                    <button
                      onClick={() => unassignMutation.mutate(a.userId)}
                      disabled={unassignMutation.isPending}
                      className="text-xs text-danger-500 hover:text-danger-700 font-medium"
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Assign staff (managers only) */}
        {canManage && shift.assignments?.length < shift.headcount && (
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Assign Staff</h3>

            {/* What-if check */}
            <div className="mb-3 p-3 bg-gray-50 rounded-lg space-y-2">
              <p className="text-xs font-medium text-gray-600">Check before assigning</p>
              <div className="flex gap-2">
                <select
                  className="input text-xs flex-1"
                  value={checkUserId}
                  onChange={e => { setCheckUserId(e.target.value); setCheckResult(null); }}
                >
                  <option value="">Select staff…</option>
                  {unassignedStaff.map((s: any) => (
                    <option key={s.id} value={s.id}>{s.firstName} {s.lastName}</option>
                  ))}
                </select>
                <button onClick={handleCheck} disabled={!checkUserId || checking} className="btn-secondary btn-sm text-xs">
                  {checking ? '…' : 'Check'}
                </button>
              </div>

              {checkResult && (
                <div className="space-y-1">
                  {checkResult.valid ? (
                    <div className="flex items-center gap-1.5 text-success-700 text-xs">
                      <span>✓</span>
                      <span>Eligible — {checkResult.projectedWeeklyHours?.toFixed(1)}h projected this week</span>
                    </div>
                  ) : null}
                  {checkResult.violations?.map((v: any, i: number) => (
                    <div key={i} className="flex items-start gap-1.5 text-danger-700 text-xs">
                      <span className="flex-shrink-0 mt-0.5">✗</span>
                      <span>{v.message}</span>
                    </div>
                  ))}
                  {checkResult.warnings?.map((w: any, i: number) => (
                    <div key={i} className="flex items-start gap-1.5 text-warning-700 text-xs">
                      <span className="flex-shrink-0 mt-0.5">⚠</span>
                      <span>{w.message}</span>
                    </div>
                  ))}
                  {checkResult.alternatives?.length > 0 && (
                    <div className="mt-1 text-xs text-gray-500">
                      <span className="font-medium">Alternatives: </span>
                      {checkResult.alternatives.map((a: any) => a.name).join(', ')}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Quick-assign eligible staff */}
            <div className="space-y-1.5">
              {unassignedStaff
                .filter((s: any) => s.skills?.includes(shift.requiredSkill))
                .map((s: any) => (
                  <button
                    key={s.id}
                    onClick={() => assignMutation.mutate(s.id)}
                    disabled={assignMutation.isPending}
                    className="w-full flex items-center gap-2 p-2 text-left rounded-lg border border-gray-100 hover:border-brand-200 hover:bg-brand-50 transition-colors"
                  >
                    <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 text-xs font-bold flex-shrink-0">
                      {s.firstName[0]}{s.lastName[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-900">{s.firstName} {s.lastName}</p>
                      <p className="text-[10px] text-gray-400 truncate">{s.skills?.join(', ')}</p>
                    </div>
                    <span className="text-xs text-brand-500">+ Assign</span>
                  </button>
                ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer actions */}
      {canManage && (
        <div className="p-5 border-t border-gray-100 flex gap-2">
          {shift.isPublished ? (
            <button onClick={() => unpublishMutation.mutate()} disabled={unpublishMutation.isPending} className="btn-secondary flex-1 justify-center text-sm">
              Unpublish
            </button>
          ) : (
            <button onClick={() => publishMutation.mutate()} disabled={publishMutation.isPending} className="btn-primary flex-1 justify-center text-sm">
              Publish
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-2 text-sm">
      <span className="text-gray-400 w-20 flex-shrink-0">{label}</span>
      <span className="text-gray-800 font-medium">{value}</span>
    </div>
  );
}
