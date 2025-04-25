import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import apiCaller from '@/utils/apiCaller';

const AUTH_ATTEMPT_KEY = 'auth_attempt_timestamp';
const AUTH_COOLDOWN_MS = 10000; // 10 seconds cooldown between auth attempts

export function useAuthRedirect() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  // Use ref to track auth attempts in current session
  const authAttemptedRef = useRef(false);
  // Use ref for request in progress tracking
  const requestInProgressRef = useRef(false);
  const hasRedirectedRef = useRef(false);

  // Check if we've recently attempted authentication (within cooldown period)
  const isRecentAttempt = useCallback(() => {
    try {
      const lastAttempt = sessionStorage.getItem(AUTH_ATTEMPT_KEY);
      if (!lastAttempt) return false;
      
      const lastAttemptTime = parseInt(lastAttempt, 10);
      const currentTime = Date.now();
      
      return currentTime - lastAttemptTime < AUTH_COOLDOWN_MS;
    } catch (err) {
      console.error('Error checking auth attempt timestamp:', err);
      return false;
    }
  }, []);

  // Mark that authentication has been attempted
  const markAuthAttempt = useCallback(() => {
    try {
      // Save in both ref (for current session) and sessionStorage (for page reloads)
      authAttemptedRef.current = true;
      sessionStorage.setItem(AUTH_ATTEMPT_KEY, Date.now().toString());
    } catch (err) {
      console.error('Error storing auth attempt timestamp:', err);
    }
  }, []);

  const authenticateWithBackend = useCallback(async (email: string | null | undefined, name: string | null | undefined, accessToken: string | undefined) => {
    // Multi-level protection against duplicate requests
    if (authAttemptedRef.current) {
      console.log('Authentication already attempted in this session, skipping');
      return false;
    }

    if (requestInProgressRef.current) {
      console.log('Authentication request already in progress, skipping');
      return false;
    }

    if (isRecentAttempt()) {
      console.log('Authentication was recently attempted, skipping due to cooldown');
      return false;
    }
    
    if (!email) {
      setAuthError('Email not provided by Google authentication');
      return false;
    }
    
    if (!accessToken) {
      setAuthError('Access token not available from Google session. Check NextAuth configuration.');
      console.warn('Access token missing in session object. Ensure it is added in the JWT/session callbacks.');
      return false;
    }

    setIsAuthLoading(true);
    setAuthError('');
    
    // Mark request as in progress to prevent parallel attempts
    requestInProgressRef.current = true;
    
    try {
      console.log('Attempting backend authentication with Google credentials...');
      // Mark auth as attempted at the beginning
      markAuthAttempt();
      
      const response = await apiCaller('users/google-auth/', 'POST', {
        email,
        name: name || email.split('@')[0],
        google_token: accessToken,
      });

      if (response && response.status === 200 && response.data.token) {
        console.log('Backend authentication successful. Storing token.');
        localStorage.setItem('token', response.data.token);
        return true;
      } else {
        console.error('Backend authentication failed:', response?.data);
        setAuthError(response?.data?.detail || 'Backend authentication failed after Google sign-in.');
        return false;
      }
    } catch (err: any) {
      console.error('Backend authentication error:', err);
      setAuthError(err?.response?.data?.detail || 'Failed to communicate with the backend authentication service.');
      return false;
    } finally {
      requestInProgressRef.current = false;
      setIsAuthLoading(false);
    }
  }, [markAuthAttempt, isRecentAttempt]); // Add new dependencies

  // Effect 1: Check for existing backend token on mount and redirect if found
  useEffect(() => {
    const token = localStorage.getItem('token');
    // Only redirect if not already on /dashboard and not already redirected
    if (
      token &&
      typeof window !== 'undefined' &&
      window.location.pathname !== '/dashboard' &&
      !hasRedirectedRef.current
    ) {
      hasRedirectedRef.current = true;
      router.push('/dashboard');
    }
  }, [router]);

  // Effect 2: Handle Google Sign-in session changes from next-auth
  useEffect(() => {
    // Don't process session changes if we've already attempted auth
    if (authAttemptedRef.current || isRecentAttempt()) {
      console.log('Skipping session change handling due to recent auth attempt');
      return;
    }

    const handleSessionChange = async () => {
      if (status === 'authenticated' && session?.user?.email && 
          !localStorage.getItem('token') && 
          !authAttemptedRef.current && 
          !requestInProgressRef.current) {
        
        console.log('Google session detected, attempting backend authentication.');
        // @ts-ignore Property 'accessToken' does not exist on type 'Session & { user?: User | AdapterUser | undefined; }'.
        const accessToken = session.accessToken as string | undefined;

        const success = await authenticateWithBackend(
          session.user.email,
          session.user.name,
          accessToken
        );

        if (success) {
          console.log('Backend authentication successful, redirecting to dashboard.');
          router.push('/dashboard');
        } else {
          console.error('Backend authentication failed after Google sign-in.');
        }
      } else if (status === 'loading') {
        console.log('NextAuth session status: loading...');
        setIsAuthLoading(true);
      } else if (status === 'unauthenticated' && isAuthLoading) {
        setIsAuthLoading(false);
      }
    };

    handleSessionChange();
  }, [session, status, authenticateWithBackend, router, isAuthLoading, isRecentAttempt]);

  return { isAuthLoading, authError, setAuthError };
}