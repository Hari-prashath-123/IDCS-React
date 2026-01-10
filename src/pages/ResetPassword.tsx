import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Lock, CheckCircle, AlertCircle } from 'lucide-react';
import AuthHeader from '../components/AuthHeader';

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasSession, setHasSession] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      try {
        // Try to get session. When a user clicks the Supabase recovery link, a session is usually established.
        const { data } = await supabase.auth.getSession();
        if (data?.session) {
          setHasSession(true);
        } else {
          // Try to extract access_token from URL hash or query
          // Supabase may return tokens in URL fragment; attempt to parse it and set session
          const hash = window.location.hash || '';
          const params = new URLSearchParams(hash.replace(/^#/, ''));
          const access_token = params.get('access_token') || searchParams.get('access_token');
          const refresh_token = params.get('refresh_token') || searchParams.get('refresh_token');
          if (access_token) {
            try {
              await supabase.auth.setSession({ access_token, refresh_token: refresh_token || '' });
              const { data: d2 } = await supabase.auth.getSession();
              if (d2?.session) setHasSession(true);
            } catch (e) {
              console.warn('Could not set session from token', e);
            }
          }
        }
      } catch (e) {
        console.warn('ResetPassword: session check failed', e);
      }
    })();
  }, [searchParams]);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError(null);
    setMessage(null);
    if (!newPassword || !confirm) return setError('Please enter and confirm your new password');
    if (newPassword !== confirm) return setError('Passwords do not match');
    if (newPassword.length < 8) return setError('Password should be at least 8 characters');

    setLoading(true);
    try {
      // Update user password using supabase client. Requires a valid session (token from link).
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setMessage('Password updated successfully. You can now sign in with your new password.');
      setTimeout(() => navigate('/login'), 2000);
    } catch (err: any) {
      console.error('ResetPassword error', err);
      setError(err?.message || String(err) || 'Failed to update password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100 flex flex-col pt-16">
      <AuthHeader />
      <div className="flex-1 flex items-center justify-center px-4 py-12 md:py-16">
        <div className="max-w-md w-full bg-white rounded-xl shadow-lg border border-slate-200 p-8">
          <h2 className="text-2xl font-bold mb-4">Set a new password</h2>
          {!hasSession && (
            <div className="mb-4 text-sm text-slate-600">We couldn't detect a valid password recovery session. Please open the link from your email and retry. If you're already on the recovery page, try clicking the link again.</div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-start mb-4">
              <AlertCircle className="h-5 w-5 mr-2 flex-shrink-0 mt-0.5" />
              <span className="text-sm">{error}</span>
            </div>
          )}

          {message && (
            <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg mb-4 flex items-center">
              <CheckCircle className="h-5 w-5 mr-2" />
              <span className="text-sm">{message}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">New password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-slate-400" />
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Confirm password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-slate-400" />
                <input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg"
                />
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <button type="submit" disabled={loading || !hasSession} className="py-2 px-4 bg-blue-600 text-white rounded disabled:opacity-50">
                {loading ? 'Saving...' : 'Save new password'}
              </button>
              <button type="button" onClick={() => navigate('/login')} className="py-2 px-4 border rounded">Back to login</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
