import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';

export default function AuthCallback(): JSX.Element {
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase.auth.getSessionFromUrl({ storeSession: true });
        if (error) console.error('supabase.getSessionFromUrl error', error);
        // data?.session may contain the new session
      } catch (err) {
        console.error('auth callback exception', err);
      }

      // Some Supabase links place params in the query, others in the fragment/hash.
      const url = new URL(window.location.href);
      const qType = url.searchParams.get('type');
      const hashParams = new URLSearchParams(window.location.hash.replace('#', '?'));
      const hType = hashParams.get('type');
      const type = qType || hType;

      // Route users depending on link type
      if (type === 'recovery') {
        navigate('/reset-password');
      } else if (type === 'signup' || type === 'invite') {
        navigate('/profile');
      } else {
        navigate('/');
      }
    })();
  }, [navigate]);

  return (
    <div className="p-6 text-center">
      Processing authentication — redirecting...
    </div>
  );
}
