'use client';
import { useAuth } from '@/lib/auth';
import { useQuery } from '@tanstack/react-query';
import { shiftsApi, locationsApi, swapsApi } from '@/lib/api';
import { format, startOfWeek } from 'date-fns';
import { formatShiftRange } from '@/lib/dates';
import Link from 'next/link';

export default function DashboardPage() {
  const { user } = useAuth();
  const weekStart = format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd'T'HH:mm:ss");

  const { data: locations = [] } = useQuery({
    queryKey: ['locations'],
    queryFn: locationsApi.list,
    enabled: !!user,
  });

  const { data: myShifts = [] } = useQuery({
    queryKey: ['shifts', 'my', weekStart],
    queryFn: () => shiftsApi.list({ weekStart }),
    enabled: !!user,
  });

  const { data: swaps = [] } = useQuery({
    queryKey: ['swaps'],
    queryFn: swapsApi.list,
    enabled: !!user && user?.role !== 'admin',
  });

  const pendingSwaps = swaps.filter((s: any) =>
    s.status === 'pending'
  );

  const upcomingShifts = myShifts
    .filter((s: any) => {
      if (user?.role === 'staff') {
        return s.assignments?.some((a: any) => a.userId === user.id);
      }
      return true;
    })
    .slice(0, 5);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}, {user?.firstName}
        </h1>
        <p className="text-gray-500 text-sm mt-1">{format(new Date(), 'EEEE, MMMM d, yyyy')}</p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Locations" value={locations.length} icon="📍" />
        <StatCard label="Shifts This Week" value={myShifts.length} icon="📅" />
        {(user?.role === 'admin' || user?.role === 'manager') && (
          <StatCard label="Pending Approvals" value={pendingSwaps.length} icon="⏳" urgent={pendingSwaps.length > 0} />
        )}
        {user?.role === 'staff' && (
          <StatCard label="My Shifts This Week" value={upcomingShifts.length} icon="🗓️" />
        )}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Upcoming shifts */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">
              {user?.role === 'staff' ? 'My Upcoming Shifts' : 'This Week\'s Shifts'}
            </h2>
            <Link href="/schedule" className="text-sm text-brand-500 hover:text-brand-700">View all →</Link>
          </div>
          {upcomingShifts.length === 0 ? (
            <p className="text-sm text-gray-500 py-4 text-center">No shifts this week</p>
          ) : (
            <div className="space-y-2">
              {upcomingShifts.map((shift: any) => (
                <div key={shift.id} className="flex items-start gap-3 p-3 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors">
                  <div className="w-2 h-2 rounded-full bg-brand-500 mt-1.5 flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 truncate">{shift.location?.name}</p>
                    <p className="text-xs text-gray-500">
                      {format(new Date(shift.startTime), 'EEE MMM d')} · {formatShiftRange(shift.startTime, shift.endTime, shift.location?.timezone || 'UTC')}
                    </p>
                    <p className="text-xs text-gray-400 capitalize mt-0.5">{shift.requiredSkill} · {shift.assignments?.length}/{shift.headcount} assigned</p>
                  </div>
                  {shift.isPremium && <span className="badge-yellow text-xs">★ Premium</span>}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Locations on-duty / quick links */}
        <div className="card p-5">
          <h2 className="font-semibold text-gray-900 mb-4">Locations</h2>
          {locations.length === 0 ? (
            <p className="text-sm text-gray-500 py-4 text-center">No locations assigned</p>
          ) : (
            <div className="space-y-2">
              {locations.map((loc: any) => (
                <div key={loc.id} className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 hover:border-brand-200 hover:bg-brand-50 transition-colors">
                  <div className="w-9 h-9 rounded-lg bg-brand-100 flex items-center justify-center flex-shrink-0">
                    <span className="text-brand-700 text-sm font-bold">{loc.name.charAt(loc.name.lastIndexOf('- ') + 2)}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{loc.name}</p>
                    <p className="text-xs text-gray-500">{loc.timezone}</p>
                  </div>
                  <Link
                    href={`/schedule?locationId=${loc.id}`}
                    className="text-xs text-brand-500 hover:text-brand-700 font-medium"
                  >
                    Schedule →
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Pending swap approvals for managers */}
      {(user?.role === 'admin' || user?.role === 'manager') && pendingSwaps.length > 0 && (
        <div className="mt-6 card p-5 border-warning-500 border">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-warning-500">⚠️</span>
            <h2 className="font-semibold text-gray-900">Pending Swap Approvals ({pendingSwaps.length})</h2>
          </div>
          <p className="text-sm text-gray-600 mb-3">The following swaps have been accepted and need your approval.</p>
          <Link href="/swaps" className="btn-primary btn-sm">Review Swaps</Link>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, icon, urgent }: { label: string; value: number; icon: string; urgent?: boolean }) {
  return (
    <div className={`card p-4 ${urgent ? 'border-warning-500 border-2' : ''}`}>
      <div className="flex items-center gap-2 mb-1">
        <span>{icon}</span>
        <span className="text-xs text-gray-500 font-medium">{label}</span>
      </div>
      <p className={`text-2xl font-bold ${urgent ? 'text-warning-700' : 'text-gray-900'}`}>{value}</p>
    </div>
  );
}
