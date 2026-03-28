'use client';
import { useAuth } from '@/lib/auth';
import { useQuery } from '@tanstack/react-query';
import { shiftsApi, locationsApi, swapsApi } from '@/lib/api';
import { format, startOfWeek } from 'date-fns';
import { formatShiftRange } from '@/lib/dates';
import Link from 'next/link';
import clsx from 'clsx';

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

  const canManage = user?.role === 'admin' || user?.role === 'manager';

  // For managers: swaps awaiting their approval (accepted by both parties)
  const pendingApproval = (swaps as any[]).filter((s: any) => s.status === 'accepted');
  // For staff: incoming swap requests they need to respond to
  const pendingResponse = (swaps as any[]).filter((s: any) =>
    s.status === 'pending' && s.targetUserId === user?.id
  );

  const upcomingShifts = (myShifts as any[])
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
          Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'},{' '}
          {user?.firstName}
        </h1>
        <p className="text-gray-500 text-sm mt-1">{format(new Date(), 'EEEE, MMMM d, yyyy')}</p>
      </div>

      {/* Alert banners */}
      {user?.role === 'staff' && pendingResponse.length > 0 && (
        <div className="mb-4 p-4 bg-brand-50 border border-brand-200 rounded-xl flex items-center justify-between gap-3">
          <p className="text-sm text-brand-700 font-medium">
            You have {pendingResponse.length} swap request{pendingResponse.length !== 1 ? 's' : ''} awaiting your response.
          </p>
          <Link href="/swaps" className="btn-primary btn-sm text-xs">Review</Link>
        </div>
      )}
      {canManage && pendingApproval.length > 0 && (
        <div className="mb-4 p-4 bg-warning-50 border border-warning-500 rounded-xl flex items-center justify-between gap-3">
          <p className="text-sm text-warning-700 font-medium">
            {pendingApproval.length} swap{pendingApproval.length !== 1 ? 's' : ''} accepted and awaiting your approval.
          </p>
          <Link href="/swaps" className="btn-primary btn-sm text-xs">Approve</Link>
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="My Locations" value={(locations as any[]).length} icon="📍" />
        <StatCard
          label={user?.role === 'staff' ? 'My Shifts This Week' : 'Shifts This Week'}
          value={upcomingShifts.length}
          icon="📅"
        />
        {canManage && (
          <StatCard label="Awaiting Approval" value={pendingApproval.length} icon="⏳" urgent={pendingApproval.length > 0} />
        )}
        {user?.role === 'staff' && (
          <StatCard label="Pending Responses" value={pendingResponse.length} icon="🔄" urgent={pendingResponse.length > 0} />
        )}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Upcoming shifts */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">
              {user?.role === 'staff' ? 'My Upcoming Shifts' : "This Week's Shifts"}
            </h2>
            <Link href="/schedule" className="text-sm text-brand-500 hover:text-brand-700 font-medium">
              View schedule →
            </Link>
          </div>
          {upcomingShifts.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-sm text-gray-500">No shifts this week</p>
              {canManage && (
                <Link href="/schedule" className="btn-primary btn-sm mt-3 inline-flex">Create shifts</Link>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {upcomingShifts.map((shift: any) => (
                <div
                  key={shift.id}
                  className="flex items-start gap-3 p-3 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors"
                >
                  <div className={clsx(
                    'w-2 h-2 rounded-full mt-1.5 flex-shrink-0',
                    shift.isPremium ? 'bg-yellow-400' : 'bg-brand-500'
                  )} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 truncate">{shift.location?.name}</p>
                    <p className="text-xs text-gray-500">
                      {format(new Date(shift.startTime), 'EEE MMM d')} ·{' '}
                      {formatShiftRange(shift.startTime, shift.endTime, shift.location?.timezone || 'UTC')}
                    </p>
                    <p className="text-xs text-gray-400 capitalize mt-0.5">
                      {shift.requiredSkill} · {shift.assignments?.length}/{shift.headcount} assigned
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {shift.isPremium && <span className="badge-yellow text-[10px]">★ Premium</span>}
                    {!shift.isPublished && <span className="badge-gray text-[10px]">Draft</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Locations */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">Locations</h2>
            {canManage && (
              <Link href="/analytics" className="text-sm text-brand-500 hover:text-brand-700 font-medium">
                Analytics →
              </Link>
            )}
          </div>
          {(locations as any[]).length === 0 ? (
            <p className="text-sm text-gray-500 py-4 text-center">No locations assigned</p>
          ) : (
            <div className="space-y-2">
              {(locations as any[]).map((loc: any) => (
                <div
                  key={loc.id}
                  className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 hover:border-brand-200 hover:bg-brand-50 transition-colors"
                >
                  <div className="w-9 h-9 rounded-lg bg-brand-100 flex items-center justify-center flex-shrink-0">
                    <span className="text-brand-700 text-sm font-bold">
                      {loc.name.charAt(loc.name.lastIndexOf('- ') + 2)}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{loc.name}</p>
                    <p className="text-xs text-gray-500">{loc.timezone}</p>
                  </div>
                  <Link
                    href={`/schedule?locationId=${loc.id}`}
                    className="text-xs text-brand-500 hover:text-brand-700 font-medium flex-shrink-0"
                  >
                    Schedule →
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Quick actions */}
      <div className="mt-6 card p-5">
        <h2 className="font-semibold text-gray-900 mb-3">Quick Actions</h2>
        <div className="flex flex-wrap gap-3">
          {user?.role === 'staff' && (
            <>
              <Link href="/availability" className="btn-secondary text-sm">Set My Availability</Link>
              <Link href="/swaps" className="btn-secondary text-sm">Request Swap / Drop</Link>
              <Link href="/schedule" className="btn-secondary text-sm">View Schedule</Link>
              <Link href="/notifications" className="btn-secondary text-sm">My Notifications</Link>
            </>
          )}
          {canManage && (
            <>
              <Link href="/schedule" className="btn-primary text-sm">Manage Schedule</Link>
              <Link href="/swaps" className="btn-secondary text-sm">Review Swap Requests</Link>
              <Link href="/analytics" className="btn-secondary text-sm">View Analytics</Link>
              {user?.role === 'admin' && (
                <Link href="/admin" className="btn-secondary text-sm">Admin Panel</Link>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label, value, icon, urgent,
}: {
  label: string; value: number; icon: string; urgent?: boolean;
}) {
  return (
    <div className={clsx('card p-4', urgent && 'border-warning-500 border-2')}>
      <div className="flex items-center gap-2 mb-1">
        <span>{icon}</span>
        <span className="text-xs text-gray-500 font-medium">{label}</span>
      </div>
      <p className={clsx('text-2xl font-bold', urgent ? 'text-warning-700' : 'text-gray-900')}>
        {value}
      </p>
    </div>
  );
}
