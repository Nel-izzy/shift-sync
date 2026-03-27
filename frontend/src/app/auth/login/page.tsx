'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import toast from 'react-hot-toast';

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, password);
      router.push('/dashboard');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  const quickLogin = (e: string, p: string) => { setEmail(e); setPassword(p); };

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-900 to-brand-500 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-white/10 backdrop-blur mb-4">
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-white">ShiftSync</h1>
          <p className="text-white/70 mt-1 text-sm">Coastal Eats Staff Scheduling</p>
        </div>

        <div className="card p-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Email</label>
              <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} required autoFocus />
            </div>
            <div>
              <label className="label">Password</label>
              <input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)} required />
            </div>
            <button className="btn-primary w-full justify-center py-2.5" disabled={loading}>
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-gray-100">
            <p className="text-xs text-gray-500 mb-3 font-medium uppercase tracking-wide">Quick access (demo)</p>
            <div className="grid grid-cols-1 gap-2">
              {[
                { label: 'Admin', email: 'admin@coastaleats.com', pw: 'Admin123!' },
                { label: 'Manager West (LA/SD)', email: 'manager.west@coastaleats.com', pw: 'Manager123!' },
                { label: 'Manager East (NY/MIA)', email: 'manager.east@coastaleats.com', pw: 'Manager123!' },
                { label: 'Staff — Sarah (LA+NY)', email: 'sarah.jones@coastaleats.com', pw: 'Staff123!' },
                { label: 'Staff — John (near OT)', email: 'john.smith@coastaleats.com', pw: 'Staff123!' },
              ].map(u => (
                <button
                  key={u.email}
                  type="button"
                  onClick={() => quickLogin(u.email, u.pw)}
                  className="text-left px-3 py-2 rounded-lg text-xs text-gray-600 hover:bg-gray-50 border border-gray-100 transition-colors"
                >
                  <span className="font-medium">{u.label}</span>
                  <span className="text-gray-400 ml-2">{u.email}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
