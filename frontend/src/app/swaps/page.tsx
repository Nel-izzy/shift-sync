'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { swapsApi, shiftsApi } from '@/lib/api';
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

export default function SwapsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState<'mine' | 'pending'>('mine');
  const [managerNote, setManagerNote] = useState('');

  const { data: swaps = [], isLoading } = useQuery({
    queryKey: ['swaps'],
    queryFn: swapsApi.list,
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => swapsApi.cancel(id),
    onSuccess: () => { toast.success('Swap cancelled'); qc.invalidateQueries({ queryKey: ['swaps'] }); },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed to cancel'),
  });

  const respondMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'accept' | 'reject' }) =>
      swapsApi.respond(id, action),
    onSuccess: () => { toast.success('Response sent'); qc.invalidateQueries({ queryKey: ['swaps'] }); },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed'),
  });

  const approveMutation = useMutation({
    mutationFn: ({ id, action, note }: { id: string; action: 'approve' | 'reject'; note?: string }) =>
      swapsApi.approve(id, action, note),
    onSuccess: () => {
      toast.success('Decision saved');
      qc.invalidateQueries({ queryKey: ['swaps'] });
      qc.invalidateQueries({ queryKey: ['shifts'] });
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed'),
  });

  const canManage = user?.role === 'admin' || user?.role === 'manager';

  const mySwaps = swaps.filter((s: any) =>
    s.requesterId === user?.id || s.targetUserId === user?.id
  );
  const pendingApproval = swaps.filter((s: any) => s.status === 'accepted');
  const pendingResponse = swaps.filter((s: any) =>
    s.status === 'pending' && s.targetUserId === user?.id
  );

  const displaySwaps = tab === 'mine' ? mySwaps : pendingApproval;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Swaps & Drops</h1>
          <p className="text-sm text-gray-500 mt-1">Manage shift swap and drop requests</p>
        </div>
      </div>

      {/* Incoming swap requests for staff */}
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
                currentUserId={user?.id || ''}
                canManage={false}
                onCancel={() => cancelMutation.mutate(swap.id)}
                onRespond={(action: 'accept' | 'reject') => respondMutation.mutate({ id: swap.id, action })}
                isLoading={respondMutation.isPending}
              />
            ))}
          </div>
        </div>
      )}

      {/* Tab switcher for managers */}
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
                {pendingApproval.length}
              </span>
            )}
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-7 h-7 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : displaySwaps.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="text-gray-400 text-sm">No swap requests found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {displaySwaps.map((swap: any) => (
            <SwapCard
              key={swap.id}
              swap={swap}
              currentUserId={user?.id || ''}
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

function SwapCard({ swap, currentUserId, canManage, onCancel, onRespond, onApprove, managerNote, onNoteChange, isLoading }: SwapCardProps) {
  const isRequester = swap.requesterId === currentUserId;
  const isTarget = swap.targetUserId === currentUserId;
  const isDrop = !swap.targetAssignmentId;

  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className={clsx('badge', STATUS_BADGE[swap.status] || 'badge-gray')}>
              {swap.status}
            </span>
            <span className="badge-gray">{isDrop ? 'Drop Request' : 'Swap Request'}</span>
            {isRequester && <span className="text-xs text-gray-400">(you requested)</span>}
            {isTarget && <span className="text-xs text-gray-400">(sent to you)</span>}
          </div>

          <p className="text-sm text-gray-600 mt-1">
            {isDrop ? 'Shift dropped for anyone to claim' : `Swap between two staff members`}
          </p>

          {swap.requesterNote && (
            <p className="text-xs text-gray-500 mt-1 italic">"{swap.requesterNote}"</p>
          )}

          <p className="text-xs text-gray-400 mt-2">
            Requested {format(new Date(swap.createdAt), 'MMM d, yyyy h:mm a')}
          </p>

          {swap.expiresAt && swap.status === 'pending' && (
            <p className="text-xs text-warning-700 mt-1">
              ⏱ Expires {format(new Date(swap.expiresAt), 'MMM d, h:mm a')}
            </p>
          )}

          {swap.managerNote && (
            <p className="text-xs text-gray-500 mt-1">
              Manager note: "{swap.managerNote}"
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2 items-end">
          {/* Staff: respond to swap request */}
          {isTarget && swap.status === 'pending' && onRespond && (
            <div className="flex gap-2">
              <button
                onClick={() => onRespond('reject')}
                disabled={isLoading}
                className="btn-secondary btn-sm text-xs"
              >
                Decline
              </button>
              <button
                onClick={() => onRespond('accept')}
                disabled={isLoading}
                className="btn-primary btn-sm text-xs"
              >
                Accept
              </button>
            </div>
          )}

          {/* Requester: cancel pending request */}
          {isRequester && ['pending', 'accepted'].includes(swap.status) && (
            <button
              onClick={onCancel}
              disabled={isLoading}
              className="btn-secondary btn-sm text-xs text-danger-600"
            >
              Cancel Request
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
                <button
                  onClick={() => onApprove('reject')}
                  disabled={isLoading}
                  className="btn-secondary btn-sm text-xs text-danger-600 flex-1"
                >
                  Reject
                </button>
                <button
                  onClick={() => onApprove('approve')}
                  disabled={isLoading}
                  className="btn-primary btn-sm text-xs flex-1"
                >
                  Approve
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
