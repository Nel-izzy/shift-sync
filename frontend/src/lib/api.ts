import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

export const api = axios.create({ baseURL: API_URL, withCredentials: false });

/**
 * Tracks whether the AuthProvider has finished its initial token validation.
 * Set to true by the AuthProvider once authApi.me() resolves or rejects.
 * This prevents the 401 interceptor from redirecting while auth is still
 * initializing — which would cause a spurious redirect to /auth/login even
 * when the user has a perfectly valid token.
 */
let authInitialized = false;
export const setAuthInitialized = () => { authInitialized = true; };

api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (
      err.response?.status === 401 &&
      typeof window !== 'undefined' &&
      !err.config?.url?.includes('/auth/login') &&
      !window.location.pathname.includes('/auth/login') &&
      !!localStorage.getItem('token') &&
      authInitialized
    ) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/auth/login';
    }
    return Promise.reject(err);
  }
);

// ---- Auth ----
export const authApi = {
  login: (email: string, password: string) =>
    api.post('/auth/login', { email, password }).then(r => r.data),
  me: () => api.get('/auth/me').then(r => r.data),
};

// ---- Locations ----
export const locationsApi = {
  list: () => api.get('/locations').then(r => r.data),
  getStaff: (id: string) => api.get(`/locations/${id}/staff`).then(r => r.data),
};

// ---- Shifts ----
export const shiftsApi = {
  list: (params: { locationId?: string; weekStart?: string; weekEnd?: string }) =>
    api.get('/shifts', { params }).then(r => r.data),
  get: (id: string) => api.get(`/shifts/${id}`).then(r => r.data),
  create: (data: any) => api.post('/shifts', data).then(r => r.data),
  assign: (shiftId: string, userId: string) =>
    api.post(`/shifts/${shiftId}/assign`, { userId }).then(r => r.data),
  unassign: (shiftId: string, userId: string) =>
    api.delete(`/shifts/${shiftId}/assign/${userId}`).then(r => r.data),
  publish: (id: string) => api.patch(`/shifts/${id}/publish`).then(r => r.data),
  publishWeek: (locationId: string, weekStart: string) =>
    api.post('/shifts/publish-week', { locationId, weekStart }).then(r => r.data),
  unpublish: (id: string) => api.patch(`/shifts/${id}/unpublish`).then(r => r.data),
  checkAssignment: (shiftId: string, userId: string) =>
    api.get(`/shifts/${shiftId}/check-assignment`, { params: { userId } }).then(r => r.data),
  getOnDuty: (locationId: string) =>
    api.get('/shifts/on-duty', { params: { locationId } }).then(r => r.data),
  getOvertime: (locationId: string, weekStart: string) =>
    api.get('/shifts/overtime', { params: { locationId, weekStart } }).then(r => r.data),
};

// ---- Swaps ----
export const swapsApi = {
  list: () => api.get('/swaps').then(r => r.data),
  create: (data: any) => api.post('/swaps', data).then(r => r.data),
  respond: (id: string, action: 'accept' | 'reject', note?: string) =>
    api.patch(`/swaps/${id}/respond`, { action, note }).then(r => r.data),
  approve: (id: string, action: 'approve' | 'reject', note?: string) =>
    api.patch(`/swaps/${id}/approve`, { action, note }).then(r => r.data),
  cancel: (id: string) => api.patch(`/swaps/${id}/cancel`).then(r => r.data),
  availableDrops: (locationId: string) =>
    api.get('/swaps/drops', { params: { locationId } }).then(r => r.data),
  claimDrop: (id: string) => api.post(`/swaps/${id}/claim`).then(r => r.data),
};

// ---- Users ----
export const usersApi = {
  // Admin / Manager
  list: () => api.get('/users').then(r => r.data),
  get: (id: string) => api.get(`/users/${id}`).then(r => r.data),
  getUserAvailability: (id: string) => api.get(`/users/${id}/availability`).then(r => r.data),
  getUserLocations: (id: string) => api.get(`/users/${id}/locations`).then(r => r.data),
  certify: (userId: string, locationId: string) =>
    api.post(`/users/${userId}/certify/${locationId}`).then(r => r.data),
  decertify: (userId: string, locationId: string) =>
    api.post(`/users/${userId}/decertify/${locationId}`).then(r => r.data),
  // Current user (any role)
  getAvailability: () => api.get('/users/me/availability').then(r => r.data),
  setAvailability: (windows: any[]) =>
    api.post('/users/me/availability', { windows }).then(r => r.data),
  setException: (data: any) =>
    api.post('/users/me/availability/exceptions', data).then(r => r.data),
  deleteException: (id: string) =>
    api.delete(`/users/me/availability/exceptions/${id}`).then(r => r.data),
  getMyAssignments: () => api.get('/users/me/assignments').then(r => r.data),
  updateProfile: (data: any) => api.patch('/users/me', data).then(r => r.data),
};

// ---- Notifications ----
export const notificationsApi = {
  list: (unread?: boolean) =>
    api.get('/notifications', { params: unread ? { unread: 'true' } : {} }).then(r => r.data),
  count: () => api.get('/notifications/count').then(r => r.data),
  markRead: (id: string) => api.patch(`/notifications/${id}/read`).then(r => r.data),
  markAllRead: () => api.patch('/notifications/read-all').then(r => r.data),
};

// ---- Analytics ----
export const analyticsApi = {
  distribution: (locationId: string, from: string, to: string) =>
    api.get('/analytics/distribution', { params: { locationId, from, to } }).then(r => r.data),
  fairness: (locationId: string, from: string, to: string) =>
    api.get('/analytics/fairness', { params: { locationId, from, to } }).then(r => r.data),
  overtimeProjection: (locationId: string, weekStart: string) =>
    api.get('/analytics/overtime-projection', { params: { locationId, weekStart } }).then(r => r.data),
};

// ---- Audit ----
export const auditApi = {
  getShiftHistory: (shiftId: string) =>
    api.get(`/audit/shift/${shiftId}`).then(r => r.data),
  export: (locationId: string, from: string, to: string) =>
    api.get('/audit/export', { params: { locationId, from, to } }).then(r => r.data),
};
