'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { auditApi, locationsApi, usersApi } from '@/lib/api';
import { format, subDays } from 'date-fns';

export default function AdminPage() {
  const [tab, setTab] = useState<'audit' | 'users'>('audit');
  const [auditLocation, setAuditLocation] = useState('');
  const [auditFrom, setAuditFrom] = useState(format(subDays(new Date(), 7), 'yyyy-MM-dd'));
  const [auditTo, setAuditTo] = useState(format(new Date(), 'yyyy-MM-dd'));

  const { data: locations = [] } = useQuery({ queryKey: ['locations'], queryFn: locationsApi.list });
  const { data: users = [] } = useQuery({ queryKey: ['all-users'], queryFn: usersApi.list, enabled: tab === 'users' });

  const { data: auditLogs = [], isLoading: auditLoading } = useQuery({
    queryKey: ['audit-export', auditLocation, auditFrom, auditTo],
    queryFn: () => auditApi.export(auditLocation, auditFrom, auditTo),
    enabled: !!auditLocation,
  });

  const ACTION_BADGE: Record<string, string> = {
    CREATE_SHIFT: 'badge-blue',
    ASSIGN_STAFF: 'badge-green',
    UNASSIGN_STAFF: 'badge-yellow',
    PUBLISH_SHIFT: 'badge-blue',
    UNPUBLISH_SHIFT: 'badge-yellow',
    SWAP_APPROVE: 'badge-green',
    SWAP_REJECT: 'badge-red',
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Admin</h1>
        <p className="text-sm text-gray-500 mt-1">System-wide oversight and audit trail</p>
      </div>

      <div className="flex gap-1 mb-6 bg-gray-100 rounded-lg p-1 w-fit">
        {(['audit', 'users'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors capitalize ${tab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
          >
            {t === 'audit' ? 'Audit Logs' : 'Users'}
          </button>
        ))}
      </div>

      {tab === 'audit' && (
        <div className="space-y-4">
          <div className="flex gap-3 flex-wrap items-end">
            <div>
              <label className="label">Location</label>
              <select className="input w-56" value={auditLocation} onChange={e => setAuditLocation(e.target.value)}>
                <option value="">Select location…</option>
                {locations.map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">From</label>
              <input type="date" className="input" value={auditFrom} onChange={e => setAuditFrom(e.target.value)} />
            </div>
            <div>
              <label className="label">To</label>
              <input type="date" className="input" value={auditTo} onChange={e => setAuditTo(e.target.value)} />
            </div>
          </div>

          {!auditLocation ? (
            <div className="card p-10 text-center text-gray-400 text-sm">Select a location to view audit logs</div>
          ) : auditLoading ? (
            <div className="card p-10 text-center"><div className="w-6 h-6 border-4 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto" /></div>
          ) : auditLogs.length === 0 ? (
            <div className="card p-10 text-center text-gray-400 text-sm">No audit logs found for this period</div>
          ) : (
            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Time</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Actor</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Action</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Entity</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {auditLogs.map((log: any) => (
                      <tr key={log.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                          {format(new Date(log.createdAt), 'MMM d, h:mm a')}
                        </td>
                        <td className="px-4 py-3 text-gray-700 text-xs">{log.actorEmail || '—'}</td>
                        <td className="px-4 py-3">
                          <span className={`badge ${ACTION_BADGE[log.action] || 'badge-gray'} text-[10px]`}>
                            {log.action.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-500 text-xs font-mono truncate max-w-[200px]">
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

      {tab === 'users' && (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Name</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Email</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Role</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Skills</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Desired hrs/wk</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {users.map((u: any) => (
                  <tr key={u.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{u.firstName} {u.lastName}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{u.email}</td>
                    <td className="px-4 py-3">
                      <span className={`badge text-[10px] ${u.role === 'admin' ? 'badge-red' : u.role === 'manager' ? 'badge-blue' : 'badge-gray'}`}>
                        {u.role}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{u.skills?.join(', ') || '—'}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{u.desiredHoursPerWeek}h</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
