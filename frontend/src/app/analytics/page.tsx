'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { analyticsApi, locationsApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { format, startOfWeek, subWeeks, subDays } from 'date-fns';

export default function AnalyticsPage() {
  const { user } = useAuth();
  const [locationId, setLocationId] = useState('');
  const [period, setPeriod] = useState<'week' | 'month'>('week');

  const { data: locations = [] } = useQuery({
    queryKey: ['locations'],
    queryFn: locationsApi.list,
    enabled: !!user,
  });

  const weekStart = format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd'T'00:00:00");
  const from = period === 'week'
    ? format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd')
    : format(subWeeks(new Date(), 4), 'yyyy-MM-dd');
  const to = format(new Date(), 'yyyy-MM-dd');

  const { data: distribution = [], isLoading: distLoading } = useQuery({
    queryKey: ['analytics-dist', locationId, from, to],
    queryFn: () => analyticsApi.distribution(locationId, from, to),
    enabled: !!user && !!locationId,
  });

  const { data: fairness } = useQuery({
    queryKey: ['analytics-fairness', locationId, from, to],
    queryFn: () => analyticsApi.fairness(locationId, from, to),
    enabled: !!user && !!locationId,
  });

  const { data: overtime } = useQuery({
    queryKey: ['analytics-overtime', locationId, weekStart],
    queryFn: () => analyticsApi.overtimeProjection(locationId, weekStart),
    enabled: !!user && !!locationId,
  });

  const maxHours = Math.max(...(distribution as any[]).map((d: any) => d.totalHours), 1);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
        <p className="text-sm text-gray-500 mt-1">Hours distribution, fairness scores, and overtime projections</p>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-6 flex-wrap">
        <select className="input w-56 text-sm" value={locationId} onChange={e => setLocationId(e.target.value)}>
          <option value="">Select location…</option>
          {(locations as any[]).map((l: any) => (
            <option key={l.id} value={l.id}>{l.name}</option>
          ))}
        </select>
        <select className="input w-36 text-sm" value={period} onChange={e => setPeriod(e.target.value as any)}>
          <option value="week">This week</option>
          <option value="month">Last 4 weeks</option>
        </select>
      </div>

      {!locationId ? (
        <div className="card p-16 text-center">
          <p className="text-3xl mb-3">📊</p>
          <p className="text-gray-400 text-sm">Select a location to view analytics</p>
        </div>
      ) : (
        <div className="space-y-6">

          {/* Overtime projection */}
          {overtime && (
            <div className="card p-5">
              <div className="flex items-start justify-between mb-4">
                <h2 className="font-semibold text-gray-900">This Week — Overtime Projection</h2>
                <div className="text-right">
                  <p className={`text-2xl font-bold ${overtime.totalProjectedOvertimeCost > 0 ? 'text-danger-600' : 'text-success-700'}`}>
                    ${overtime.totalProjectedOvertimeCost?.toFixed(0)}
                  </p>
                  <p className="text-xs text-gray-400">projected OT cost</p>
                </div>
              </div>
              <div className="space-y-2">
                {overtime.staff?.length === 0 && (
                  <p className="text-sm text-gray-400">No shifts scheduled this week yet.</p>
                )}
                {overtime.staff?.map((s: any) => (
                  <div key={s.name} className="flex items-center gap-3">
                    <span className="text-sm text-gray-700 w-32 truncate">{s.name}</span>
                    <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                      <div
                        className={`h-2 rounded-full transition-all ${s.hours > 40 ? 'bg-danger-500' : 'bg-brand-400'}`}
                        style={{ width: `${Math.min((s.hours / 60) * 100, 100)}%` }}
                      />
                    </div>
                    <span className={`text-xs font-medium w-24 text-right ${s.overtimeHours > 0 ? 'text-danger-600' : 'text-gray-500'}`}>
                      {s.hours}h{s.overtimeHours > 0 ? ` (+${s.overtimeHours}h OT)` : ''}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Fairness */}
          {fairness && (
            <div className="card p-5">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="font-semibold text-gray-900">Premium Shift Fairness</h2>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Premium = Friday/Saturday evenings. Expected per person: <strong>{fairness.expectedPremiumPerPerson}</strong>
                  </p>
                </div>
                <div className="text-right">
                  <p className={`text-3xl font-bold ${fairness.overallFairness >= 80 ? 'text-success-700' : fairness.overallFairness >= 50 ? 'text-warning-700' : 'text-danger-600'}`}>
                    {fairness.overallFairness}%
                  </p>
                  <p className="text-xs text-gray-400">overall fairness</p>
                </div>
              </div>
              {fairness.staff?.length === 0 ? (
                <p className="text-sm text-gray-400">No data for selected period.</p>
              ) : (
                <div className="space-y-2">
                  {fairness.staff?.map((s: any) => (
                    <div key={s.userId} className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 text-xs font-bold flex-shrink-0">
                        {s.name.split(' ').map((n: string) => n[0]).join('')}
                      </div>
                      <span className="text-sm text-gray-700 w-28 truncate">{s.name}</span>
                      <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                        <div
                          className={`h-2 rounded-full ${s.fairnessScore >= 80 ? 'bg-success-500' : s.fairnessScore >= 50 ? 'bg-warning-500' : 'bg-danger-500'}`}
                          style={{ width: `${Math.max(s.fairnessScore, 2)}%` }}
                        />
                      </div>
                      <div className="flex items-center gap-2 w-32 justify-end">
                        <span className="text-xs text-gray-400">★ {s.premiumShifts}</span>
                        <span className={`text-xs font-medium ${s.premiumDeviation > 0.5 ? 'text-warning-700' : s.premiumDeviation < -0.5 ? 'text-brand-600' : 'text-gray-400'}`}>
                          {s.premiumDeviation > 0 ? `+${s.premiumDeviation.toFixed(1)}` : s.premiumDeviation.toFixed(1)}
                        </span>
                        <span className="text-xs text-gray-500">{s.fairnessScore}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Hours distribution */}
          <div className="card p-5">
            <h2 className="font-semibold text-gray-900 mb-4">Hours Distribution</h2>
            {distLoading ? (
              <div className="h-32 flex items-center justify-center">
                <div className="w-6 h-6 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (distribution as any[]).length === 0 ? (
              <p className="text-sm text-gray-400 py-4 text-center">No assignment data for selected period.</p>
            ) : (
              <div className="space-y-3">
                {(distribution as any[]).map((d: any) => (
                  <div key={d.userId} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium text-gray-800">{d.name}</span>
                      <div className="flex items-center gap-3 text-xs text-gray-500">
                        <span>{d.totalShifts} shift{d.totalShifts !== 1 ? 's' : ''}</span>
                        <span className={d.hoursDiff > 8 ? 'text-warning-700 font-medium' : d.hoursDiff < -8 ? 'text-brand-500' : ''}>
                          {d.totalHours}h
                          {d.hoursDiff !== 0 && ` (${d.hoursDiff > 0 ? '+' : ''}${d.hoursDiff}h vs desired)`}
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-0.5 h-3 rounded-full overflow-hidden bg-gray-100">
                      <div
                        className="bg-brand-400 rounded-l-full"
                        style={{ width: `${((d.totalHours - d.premiumHours) / maxHours) * 100}%` }}
                        title={`Regular: ${d.totalHours - d.premiumHours}h`}
                      />
                      {d.premiumHours > 0 && (
                        <div
                          className="bg-yellow-400"
                          style={{ width: `${(d.premiumHours / maxHours) * 100}%` }}
                          title={`Premium: ${d.premiumHours}h`}
                        />
                      )}
                    </div>
                  </div>
                ))}
                <div className="flex gap-4 pt-1 text-xs text-gray-400">
                  <span className="flex items-center gap-1.5"><span className="w-3 h-2 bg-brand-400 rounded-sm inline-block" />Regular</span>
                  <span className="flex items-center gap-1.5"><span className="w-3 h-2 bg-yellow-400 rounded-sm inline-block" />Premium (Fri/Sat eve)</span>
                </div>
              </div>
            )}
          </div>

        </div>
      )}
    </div>
  );
}
