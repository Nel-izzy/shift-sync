import { format, startOfWeek, endOfWeek, addDays, parseISO } from 'date-fns';
import { toZonedTime, formatInTimeZone } from 'date-fns-tz';

export const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const DAYS_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function getWeekBounds(date: Date = new Date()) {
  const start = startOfWeek(date, { weekStartsOn: 1 });
  const end = endOfWeek(date, { weekStartsOn: 1 });
  return { start, end };
}

export function getWeekDays(weekStart: Date) {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

export function formatShiftTime(date: string | Date, timezone: string) {
  return formatInTimeZone(new Date(date), timezone, 'h:mm a');
}

export function formatShiftDate(date: string | Date, timezone: string) {
  return formatInTimeZone(new Date(date), timezone, 'EEE, MMM d');
}

export function formatShiftRange(start: string | Date, end: string | Date, timezone: string) {
  return `${formatShiftTime(start, timezone)} – ${formatShiftTime(end, timezone)}`;
}

export function isOvernightShift(start: string | Date, end: string | Date) {
  const s = new Date(start);
  const e = new Date(end);
  return e.getUTCDate() !== s.getUTCDate() || (e.getTime() - s.getTime()) > 12 * 3600000;
}

export function shiftDurationHours(start: string | Date, end: string | Date) {
  return (new Date(end).getTime() - new Date(start).getTime()) / 3600000;
}

export function formatWeekLabel(start: Date) {
  const end = endOfWeek(start, { weekStartsOn: 1 });
  return `${format(start, 'MMM d')} – ${format(end, 'MMM d, yyyy')}`;
}
