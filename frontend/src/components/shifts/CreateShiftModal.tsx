'use client';
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { shiftsApi } from '@/lib/api';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

const SKILLS = ['bartender', 'line cook', 'server', 'host'];

interface Props {
  locations: any[];
  defaultLocationId?: string;
  defaultDate?: Date;
  onClose: () => void;
  onCreated: () => void;
}

export function CreateShiftModal({ locations, defaultLocationId, defaultDate, onClose, onCreated }: Props) {
  const defaultDateStr = defaultDate ? format(defaultDate, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd');

  const [form, setForm] = useState({
    locationId: defaultLocationId || locations[0]?.id || '',
    requiredSkill: 'server',
    date: defaultDateStr,
    startHour: '18',
    startMinute: '00',
    endHour: '22',
    endMinute: '00',
    headcount: 1,
    notes: '',
  });

  const mutation = useMutation({
    mutationFn: (data: any) => shiftsApi.create(data),
    onSuccess: () => { toast.success('Shift created'); onCreated(); },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed to create shift'),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const start = new Date(`${form.date}T${form.startHour.padStart(2,'0')}:${form.startMinute}:00`);
    let end = new Date(`${form.date}T${form.endHour.padStart(2,'0')}:${form.endMinute}:00`);
    // Overnight: if end is before start, next day
    if (end <= start) {
      end = new Date(end.getTime() + 24 * 3600000);
    }
    mutation.mutate({
      locationId: form.locationId,
      requiredSkill: form.requiredSkill,
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      headcount: form.headcount,
      notes: form.notes || undefined,
    });
  };

  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">New Shift</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="label">Location</label>
            <select className="input" value={form.locationId} onChange={e => set('locationId', e.target.value)} required>
              {locations.map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>

          <div>
            <label className="label">Required Skill</label>
            <select className="input" value={form.requiredSkill} onChange={e => set('requiredSkill', e.target.value)}>
              {SKILLS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div>
            <label className="label">Date</label>
            <input className="input" type="date" value={form.date} onChange={e => set('date', e.target.value)} required />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Start Time</label>
              <div className="flex gap-2">
                <input className="input" type="number" min="0" max="23" value={form.startHour}
                  onChange={e => set('startHour', e.target.value)} placeholder="HH" />
                <input className="input" type="number" min="0" max="59" step="15" value={form.startMinute}
                  onChange={e => set('startMinute', e.target.value)} placeholder="MM" />
              </div>
            </div>
            <div>
              <label className="label">End Time</label>
              <div className="flex gap-2">
                <input className="input" type="number" min="0" max="23" value={form.endHour}
                  onChange={e => set('endHour', e.target.value)} placeholder="HH" />
                <input className="input" type="number" min="0" max="59" step="15" value={form.endMinute}
                  onChange={e => set('endMinute', e.target.value)} placeholder="MM" />
              </div>
            </div>
          </div>
          <p className="text-xs text-gray-400">If end time is before start time, shift will continue into the next day (overnight).</p>

          <div>
            <label className="label">Headcount</label>
            <input className="input" type="number" min="1" max="20" value={form.headcount}
              onChange={e => set('headcount', parseInt(e.target.value))} required />
          </div>

          <div>
            <label className="label">Notes (optional)</label>
            <textarea className="input resize-none" rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center">Cancel</button>
            <button type="submit" disabled={mutation.isPending} className="btn-primary flex-1 justify-center">
              {mutation.isPending ? 'Creating…' : 'Create Shift'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
