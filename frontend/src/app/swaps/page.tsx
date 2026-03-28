'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { swapsApi, usersApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import clsx from 'clsx';

const STATUS_BADGE: Record<string, string> = {
  pending: 'badge-yellow',
  accepted: 'badge-blue',
  approved: 'badge-green',
  rejected: 'badge-red',
  cancelled: 'badge-gray',
  expired: 'badge-gray',
};

interface SwapCardProps {
  swap: any;
  currentUserId: string;
  canManage: boolean;
  onCancel?: () => void;
  onRespond?: (action: 'accept' | 'reject') => void;
  onApprove?: (action: 'approve' | 'reject') => void;
  managerNote?: string;
  onNoteChange?: (val: string) => void;
  isLoading?: boolean;
}

function SwapCard({
  swap, currentUserId, canManage,
  onCancel, onRespond, onApprove,
  managerNote, onNoteChange, isLoading,
}: SwapCardProps) {
  const isRequester = swap.requesterId === currentUserId;
  const isTarget = swap.targetUserId === currentUserId;
  const isDrop = !swap.targetAssignmentId;

  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={clsx('badge', STATUS_BADGE[swap.status] ?? 'badge-gray')}>
              {swap.status}
            </span>
            <span className="badge-gray">{isDrop ? 'Drop Request' : 'Swap Request'}</span>
            {isRequester && <span className="text-xs text-gray-400">(you requested)</span>}
            {isTarget && <span className="text-xs text-gray-400">(sent to you)</span>}
          </div>

          {swap.requesterNote && (
            <p className="text-xs text-gray-500 italic mt-1">"{swap.requesterNote}"</p>
          )}
          {swap.managerNote && (
            <p className="text-xs text-gray-500 mt-1">Manager note: "{swap.managerNote}"</p>
          )}

          <p className="text-xs text-gray-400 mt-2">
            {format(new Date(swap.createdAt), 'MMM d, yyyy h:mm a')}
          </p>
          {swap.expiresAt && swap.status === 'pending' && (
            <p className="text-xs text-warning-700 mt-0.5">
              Expires {format(new Date(swap.expiresAt), 'MMM d, h:mm a')}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2 items-end">
          {/* Staff: respond to incoming swap */}
          {isTarget && swap.status === 'pending' && onRespond && (
            <div className="flex gap-2">
              <button onClick={() => onRespond('reject')} disabled={isLoading} className="btn-secondary btn-sm text-xs">Decline</button>
              <button onClick={() => onRespond('accept')} disabled={isLoading} className="btn-primary btn-sm text-xs">Accept</button>
            </div>
          )}

          {/* Staff: cancel own request */}
          {isRequester && ['pending', 'accepted'].includes(swap.status) && onCancel && (
            <button onClick={onCancel} disabled={isLoading} className="btn-secondary btn-sm text-xs text-danger-600">
              Cancel
            </button>
          )}

          {/* Manager: approve/reject accepted swap */}
          {canManage && swap.status === 'accepted' && onApprove && (
            <div className="space-y-2">
              <input
                type="text"
                placeholder="Manager note (optional)"
                className="input text-xs w-48"
                value={managerNote}
                onChange={e => onNoteChange?.(e.target.value)}
              />
              <div className="flex gap-2">
                <button onClick={() => onApprove('reject')} disabled={isLoading} className="btn-secondary btn-sm text-xs text-danger-600 flex-1">Reject</button>
                <button onClick={() => onApprove('approve')} disabled={isLoading} className="btn-primary btn-sm text-xs flex-1">Approve</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function SwapsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState<'mine' | 'pending'>('mine');
  const [managerNote, setManagerNote] = useState('');
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [requestAssignmentId, setRequestAssignmentId] = useState('');
  const [targetAssignmentId, setTargetAssignmentId] = useState('');
  const [requestNote, setRequestNote] = useState('');
  const [requestType, setRequestType] = useState<'swap' | 'drop'>('drop');

  const canManage = user?.role === 'admin' || user?.role === 'manager';

  const { data: swaps = [], isLoading } = useQuery({
    queryKey: ['swaps'],
    queryFn: swapsApi.list,
    enabled: !!user,
  });

  const { data: myAssignments = [] } = useQuery({
    queryKey: ['my-assignments'],
    queryFn: usersApi.getMyAssignments,
    enabled: !!user && user.role === 'staff',
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => swapsApi.cancel(id),
    onSuccess: () => { toast.success('Request cancelled'); qc.invalidateQueries({ queryKey: ['swaps'] }); },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed to cancel'),
  });

  const respondMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'accept' | 'reject' }) => swapsApi.respond(id, action),
    onSuccess: () => { toast.success('Response sent'); qc.invalidateQueries({ queryKey: ['swaps'] }); },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed'),
  });

  const approveMutation = useMutation({
    mutationFn: ({ id, action, note }: { id: string; action: 'approve' | 'reject'; note?: string }) =>
      swapsApi.approve(id, action, note),
    onSuccess: () => {
      toast.success('Decision saved');
      setManagerNote('');
      qc.invalidateQueries({ queryKey: ['swaps'] });
      qc.invalidateQueries({ queryKey: ['shifts'] });
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed'),
  });

  const createMutation = useMutation({
    mutationFn: () => swapsApi.create({
      requesterAssignmentId: requestAssignmentId,
      targetAssignmentId: requestType === 'swap' ? targetAssignmentId : undefined,
      note: requestNote || undefined,
    }),
    onSuccess: () => {
      toast.success(requestType === 'drop' ? 'Drop request posted' : 'Swap request sent');
      setShowRequestForm(false);
      setRequestAssignmentId('');
      setTargetAssignmentId('');
      setRequestNote('');
      qc.invalidateQueries({ queryKey: ['swaps'] });
    },
    onError: (e: any) => {
      const err = e.response?.data;
      if (err?.requesterViolations?.length) {
        err.requesterViolations.forEach((v: any) => toast.error(v.message));
      } else {
        toast.error(err?.message || 'Failed to create request');
      }
    },
  });

  const mySwaps = (swaps as any[]).filter(s => s.requesterId === user?.id || s.targetUserId === user?.id);
  const pendingApproval = (swaps as any[]).filter(s => s.status === 'accepted');
  const pendingResponse = (swaps as any[]).filter(s => s.status === 'pending' && s.targetUserId === user?.id);
  const displaySwaps = tab === 'mine' ? mySwaps : pendingApproval;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Swaps & Drops</h1>
          <p className="text-sm text-gray-500 mt-1">Request shift swaps or drop a shift for others to claim</p>
        </div>
        {user?.role === 'staff' && (
          <button onClick={() => setShowRequestForm(v => !v)} className="btn-primary btn-sm">
            {showRequestForm ? 'Cancel' : '+ New Request'}
          </button>
        )}
      </div>

      {/* New request form for staff */}
      {showRequestForm && user?.role === 'staff' && (
        <div className="card p-5 mb-6 border-brand-200 border">
          <h2 className="font-semibold text-gray-900 mb-4">New Swap / Drop Request</h2>

          <div className="space-y-4">
            <div>
              <label className="label">Request Type</label>
              <div className="flex gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="type" value="drop" checked={requestType === 'drop'} onChange={() => setRequestType('drop')} />
                  <span className="text-sm">Drop — put my shift up for anyone to claim</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="type" value="swap" checked={requestType === 'swap'} onChange={() => setRequestType('swap')} />
                  <span className="text-sm">Swap — exchange shifts with a specific person</span>
                </label>
              </div>
            </div>

            <div>
              <label className="label">My Shift to {requestType === 'drop' ? 'Drop' : 'Swap Away'}</label>
              {myAssignments.length === 0 ? (
                <p className="text-sm text-gray-400">No upcoming assignments found.</p>
              ) : (
                <select className="input" value={requestAssignmentId} onChange={e => setRequestAssignmentId(e.target.value)}>
                  <option value="">Select a shift…</option>
                  {myAssignments.map((a: any) => (
                    <option key={a.assignment.id} value={a.assignment.id}>
                      {a.location.name} — {format(new Date(a.shift.startTime), 'EEE MMM d, h:mm a')} ({a.shift.requiredSkill})
                    </option>
                  ))}
                </select>
              )}
            </div>

            {requestType === 'swap' && (
              <div>
                <label className="label">Target Assignment ID</label>
                <p className="text-xs text-gray-400 mb-1">
                  Ask the other staff member for their assignment ID from their "My Assignments" section, or coordinate via the schedule.
                </p>
                <input
                  type="text"
                  className="input"
                  placeholder="Paste assignment UUID…"
                  value={targetAssignmentId}
                  onChange={e => setTargetAssignmentId(e.target.value)}
                />
              </div>
            )}

            <div>
              <label className="label">Note (optional)</label>
              <input
                type="text"
                className="input"
                placeholder="Reason for request…"
                value={requestNote}
                onChange={e => setRequestNote(e.target.value)}
              />
            </div>

            <button
              onClick={() => createMutation.mutate()}
              disabled={!requestAssignmentId || createMutation.isPending || (requestType === 'swap' && !targetAssignmentId)}
              className="btn-primary"
            >
              {createMutation.isPending ? 'Submitting…' : 'Submit Request'}
            </button>
          </div>
        </div>
      )}

      {/* Incoming swap requests that need a response */}
      {pendingResponse.length > 0 && (
        <div className="mb-6 card p-5 border-brand-200 border-2">
          <h2 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-brand-500 animate-pulse" />
            Swap Requests Awaiting Your Response ({pendingResponse.length})
          </h2>
          <div className="space-y-3">
            {pendingResponse.map((swap: any) => (
              <SwapCard
                key={swap.id}
                swap={swap}
                currentUserId={user?.id ?? ''}
                canManage={false}
                onCancel={() => cancelMutation.mutate(swap.id)}
                onRespond={(action: 'accept' | 'reject') => respondMutation.mutate({ id: swap.id, action })}
                isLoading={respondMutation.isPending}
              />
            ))}
          </div>
        </div>
      )}

      {/* Tab switcher */}
      {canManage && (
        <div className="flex gap-1 mb-4 bg-gray-100 rounded-lg p-1 w-fit">
          <button
            onClick={() => setTab('mine')}
            className={clsx('px-4 py-1.5 rounded-md text-sm font-medium transition-colors',
              tab === 'mine' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900')}
          >
            All Requests
          </button>
          <button
            onClick={() => setTab('pending')}
            className={clsx('px-4 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5',
              tab === 'pending' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900')}
          >
            Needs Approval
            {pendingApproval.length > 0 && (
              <span className="w-5 h-5 bg-brand-500 text-white text-xs rounded-full flex items-center justify-center">
                {pendingApproval.length > 9 ? '9+' : pendingApproval.length}
              </span>
            )}
          </button>
        </div>
      )}

      {/* List */}
      {isLoading ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-7 h-7 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : displaySwaps.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="text-gray-400 text-sm">
            {tab === 'pending' ? 'No swaps awaiting approval' : 'No swap or drop requests yet'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {displaySwaps.map((swap: any) => (
            <SwapCard
              key={swap.id}
              swap={swap}
              currentUserId={user?.id ?? ''}
              canManage={canManage}
              onCancel={() => cancelMutation.mutate(swap.id)}
              onRespond={(action: 'accept' | 'reject') => respondMutation.mutate({ id: swap.id, action })}
              onApprove={(action: 'approve' | 'reject') => approveMutation.mutate({ id: swap.id, action, note: managerNote })}
              managerNote={managerNote}
              onNoteChange={setManagerNote}
              isLoading={cancelMutation.isPending || respondMutation.isPending || approveMutation.isPending}
            />
          ))}
        </div>
      )}
    </div>
  );
}
