'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { auditApi, locationsApi, usersApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { format, subDays } from 'date-fns';
import toast from 'react-hot-toast';
import clsx from 'clsx';

type AdminTab = 'audit' | 'users' | 'certifications';

const ACTION_BADGE: Record<string, string> = {
  CREATE_SHIFT: 'badge-blue', ASSIGN_STAFF: 'badge-green',
  UNASSIGN_STAFF: 'badge-yellow', PUBLISH_SHIFT: 'badge-blue',
  UNPUBLISH_SHIFT: 'badge-yellow', SWAP_APPROVE: 'badge-green',
  SWAP_REJECT: 'badge-red', PUBLISH_SCHEDULE: 'badge-blue',
};

export default function AdminPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState<AdminTab>('users');
  const [auditLocation, setAuditLocation] = useState('');
  const [auditFrom, setAuditFrom] = useState(format(subDays(new Date(), 7), 'yyyy-MM-dd'));
  const [auditTo, setAuditTo] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [certUserId, setCertUserId] = useState('');
  const [certLocationId, setCertLocationId] = useState('');

  const { data: locations = [] } = useQuery({
    queryKey: ['locations'],
    queryFn: locationsApi.list,
    enabled: !!user,
  });

  const { data: allUsers = [] } = useQuery({
    queryKey: ['all-users'],
    queryFn: usersApi.list,
    enabled: !!user,
  });

  const { data: auditLogs = [], isLoading: auditLoading } = useQuery({
    queryKey: ['audit-export', auditLocation, auditFrom, auditTo],
    queryFn: () => auditApi.export(auditLocation, auditFrom, auditTo),
    enabled: !!user && !!auditLocation,
  });

  const certifyMutation = useMutation({
    mutationFn: () => usersApi.certify(certUserId, certLocationId),
    onSuccess: () => {
      toast.success('Staff certified at location');
      qc.invalidateQueries({ queryKey: ['all-users'] });
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed'),
  });

  const decertifyMutation = useMutation({
    mutationFn: ({ userId, locationId }: { userId: string; locationId: string }) =>
      usersApi.decertify(userId, locationId),
    onSuccess: () => {
      toast.success('Certification removed');
      qc.invalidateQueries({ queryKey: ['user-locations', certUserId] });
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed'),
  });

  const selectedUser = (allUsers as any[]).find((u: any) => u.id === certUserId);

  const { data: userLocations = [] } = useQuery({
    queryKey: ['user-locations', certUserId],
    queryFn: () => usersApi.getUserLocations(certUserId),
    enabled: !!certUserId,
  });

  const tabs: { key: AdminTab; label: string }[] = [
    { key: 'users', label: 'Users' },
    { key: 'certifications', label: 'Certifications' },
    { key: 'audit', label: 'Audit Logs' },
  ];

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Admin</h1>
        <p className="text-sm text-gray-500 mt-1">User management, certifications, and audit trail</p>
      </div>

      <div className="flex gap-1 mb-6 bg-gray-100 rounded-lg p-1 w-fit">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={clsx('px-4 py-1.5 rounded-md text-sm font-medium transition-colors',
              tab === t.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900')}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Users tab */}
      {tab === 'users' && (
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">All Users ({(allUsers as any[]).length})</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {['Name', 'Email', 'Role', 'Skills', 'Desired hrs/wk', 'Status'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {(allUsers as any[]).map((u: any) => (
                  <tr key={u.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{u.firstName} {u.lastName}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{u.email}</td>
                    <td className="px-4 py-3">
                      <span className={clsx('badge text-[10px]',
                        u.role === 'admin' ? 'badge-red' : u.role === 'manager' ? 'badge-blue' : 'badge-gray'
                      )}>
                        {u.role}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs max-w-[140px] truncate">{u.skills?.join(', ') || '—'}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{u.desiredHoursPerWeek}h</td>
                    <td className="px-4 py-3">
                      <span className={clsx('badge text-[10px]', u.isActive ? 'badge-green' : 'badge-red')}>
                        {u.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Certifications tab */}
      {tab === 'certifications' && (
        <div className="space-y-5">
          <div className="card p-5">
            <h2 className="font-semibold text-gray-900 mb-4">Manage Staff Certifications</h2>
            <p className="text-xs text-gray-500 mb-4">
              Certify a staff member at a location to allow them to be assigned shifts there.
              Decertifying preserves historical assignment data.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
              <div>
                <label className="label">Staff Member</label>
                <select className="input" value={certUserId} onChange={e => setCertUserId(e.target.value)}>
                  <option value="">Select staff…</option>
                  {(allUsers as any[]).filter((u: any) => u.role === 'staff').map((u: any) => (
                    <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Location</label>
                <select className="input" value={certLocationId} onChange={e => setCertLocationId(e.target.value)}>
                  <option value="">Select location…</option>
                  {(locations as any[]).map((l: any) => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-end">
                <button
                  onClick={() => certifyMutation.mutate()}
                  disabled={!certUserId || !certLocationId || certifyMutation.isPending}
                  className="btn-primary w-full justify-center"
                >
                  {certifyMutation.isPending ? 'Saving…' : 'Certify'}
                </button>
              </div>
            </div>

            {/* Current certifications for selected user */}
            {certUserId && (
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">
                  {selectedUser?.firstName} {selectedUser?.lastName}'s current certifications
                </h3>
                {(userLocations as any[]).length === 0 ? (
                  <p className="text-sm text-gray-400">No active certifications.</p>
                ) : (
                  <div className="space-y-2">
                    {(userLocations as any[]).map((row: any) => (
                      <div key={row.cert.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div>
                          <span className="text-sm font-medium text-gray-900">{row.location.name}</span>
                          <span className="text-xs text-gray-400 ml-2">{row.location.timezone}</span>
                        </div>
                        <button
                          onClick={() => decertifyMutation.mutate({ userId: certUserId, locationId: row.location.id })}
                          disabled={decertifyMutation.isPending}
                          className="text-xs text-danger-500 hover:text-danger-700 font-medium"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Audit logs tab */}
      {tab === 'audit' && (
        <div className="space-y-4">
          <div className="flex gap-3 flex-wrap items-end">
            <div>
              <label className="label">Location</label>
              <select className="input w-56 text-sm" value={auditLocation} onChange={e => setAuditLocation(e.target.value)}>
                <option value="">Select location…</option>
                {(locations as any[]).map((l: any) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">From</label>
              <input type="date" className="input text-sm" value={auditFrom} onChange={e => setAuditFrom(e.target.value)} />
            </div>
            <div>
              <label className="label">To</label>
              <input type="date" className="input text-sm" value={auditTo} onChange={e => setAuditTo(e.target.value)} />
            </div>
          </div>

          {!auditLocation ? (
            <div className="card p-10 text-center text-gray-400 text-sm">Select a location to view audit logs</div>
          ) : auditLoading ? (
            <div className="card p-10 text-center">
              <div className="w-6 h-6 border-4 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto" />
            </div>
          ) : (auditLogs as any[]).length === 0 ? (
            <div className="card p-10 text-center text-gray-400 text-sm">No audit logs for this period</div>
          ) : (
            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      {['Time', 'Actor', 'Action', 'Entity'].map(h => (
                        <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {(auditLogs as any[]).map((log: any) => (
                      <tr key={log.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                          {format(new Date(log.createdAt), 'MMM d, h:mm a')}
                        </td>
                        <td className="px-4 py-3 text-gray-700 text-xs">{log.actorEmail || '—'}</td>
                        <td className="px-4 py-3">
                          <span className={clsx('badge text-[10px]', ACTION_BADGE[log.action] || 'badge-gray')}>
                            {log.action.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-400 text-xs font-mono">
                          {log.entityType} {log.entityId?.slice(0, 8)}…
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
