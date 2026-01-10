import { useEffect, useRef, useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

export function useInactivityLogout(timeoutMinutes: number = 3) {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const warningTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  const [showWarning, setShowWarning] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(30);
  
  const TIMEOUT_MS = timeoutMinutes * 60 * 1000; // Convert minutes to milliseconds
  const WARNING_MS = TIMEOUT_MS - 30000; // Show warning 30 seconds before logout
  const resetTimer = useCallback(() => {
    // Clear existing timers
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    if (warningTimeoutRef.current) {
      clearTimeout(warningTimeoutRef.current);
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }

    // Hide warning if showing
    setShowWarning(false);
    setSecondsRemaining(30);

    // Set warning timer (30 seconds before logout)
    warningTimeoutRef.current = setTimeout(() => {
      console.info('Inactivity warning: showing 30s countdown');
      setShowWarning(true);
      setSecondsRemaining(30);
      
      // Start countdown
      let countdown = 30;
      countdownIntervalRef.current = setInterval(() => {
        countdown--;
        setSecondsRemaining(countdown);
        if (countdown <= 0) {
          if (countdownIntervalRef.current) {
            clearInterval(countdownIntervalRef.current);
            countdownIntervalRef.current = null;
          }
        }
      }, 1000);
    }, WARNING_MS);

    // Set logout timer
    timeoutRef.current = setTimeout(async () => {
      console.log('Auto-logout due to inactivity');
      setShowWarning(false);
      try {
        await signOut();
        navigate('/login', { replace: true });
      } catch (error) {
        console.error('Error during auto-logout:', error);
      }
    }, TIMEOUT_MS);
  }, [signOut, navigate, WARNING_MS, TIMEOUT_MS]);

  const cancelLogout = useCallback(() => {
    setShowWarning(false);
    setSecondsRemaining(30);
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    // Reset the inactivity timer
    resetTimer();
  }, [resetTimer]);

  useEffect(() => {
    // Only apply to student users (case-insensitive)
    if (!profile || String(profile.role || '').toLowerCase() !== 'student') {
      return;
    }

    // Activity events to monitor
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];

    // Throttle to prevent excessive timer resets
    let throttleTimeout: NodeJS.Timeout | null = null;
    const throttledResetTimer = () => {
      if (!throttleTimeout) {
        throttleTimeout = setTimeout(() => {
          resetTimer();
          throttleTimeout = null;
        }, 1000); // Throttle to once per second
      }
    };

    // Add event listeners
    events.forEach(event => {
      window.addEventListener(event, throttledResetTimer);
    });

    // Initialize timer
    resetTimer();

    // Cleanup
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (warningTimeoutRef.current) {
        clearTimeout(warningTimeoutRef.current);
      }
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }
      if (throttleTimeout) {
        clearTimeout(throttleTimeout);
      }
      events.forEach(event => {
        window.removeEventListener(event, throttledResetTimer);
      });
    };
  }, [profile, resetTimer]);

  return { showWarning, secondsRemaining, cancelLogout };
}
