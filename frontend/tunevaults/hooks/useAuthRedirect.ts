import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import apiCaller from '@/utils/apiCaller';

export function useAuthRedirect() {
  const router = useRouter();
  const { data: session, status } = useSession();
  // Separate loading/error states: one for the hook's background tasks, one potentially for form submissions
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  // Add a ref to track if authentication has been attempted
  const authAttemptedRef = useRef(false);

  const authenticateWithBackend = useCallback(async (email: string | null | undefined, name: string | null | undefined, accessToken: string | undefined) => {
    // Prevent multiple authentication attempts
    if (authAttemptedRef.current) {
      console.log('Authentication already attempted, skipping duplicate request');
      return false;
    }
    
    if (!email) {
      setAuthError('Email not provided by Google authentication');
      return false;
    }
    // Ensure accessToken is available - this depends on your next-auth config
    if (!accessToken) {
        setAuthError('Access token not available from Google session. Check NextAuth configuration.');
        console.warn('Access token missing in session object. Ensure it is added in the JWT/session callbacks.');
        return false;
    }

    setIsAuthLoading(true);
    setAuthError(''); // Clear previous errors
    try {
      console.log('Attempting backend authentication with Google credentials...');
      // Mark that authentication has been attempted
      authAttemptedRef.current = true;
      
      const response = await apiCaller('users/google-auth/', 'POST', {
        email,
        name: name || email.split('@')[0], // Use part of email if name is null
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
      setIsAuthLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // router is stable, apiCaller is stable

  // Effect 1: Check for existing backend token on mount and redirect if found
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      // Optional: Add token verification step here if needed
      console.log('Existing backend token found, redirecting to dashboard.');
      router.push('/dashboard');
    }
  }, [router]); // Run only once on mount

  // Effect 2: Handle Google Sign-in session changes from next-auth
  useEffect(() => {
    const handleSessionChange = async () => {
      // Only proceed if authenticated via next-auth AND no backend token exists yet
      // AND we haven't already attempted authentication
      if (status === 'authenticated' && session?.user?.email && 
          !localStorage.getItem('token') && !authAttemptedRef.current) {
        console.log('Google session detected, attempting backend authentication.');
        // Assuming accessToken is correctly populated in the session object by next-auth callbacks
        // You might need to adjust your [..nextauth].ts file (jwt and session callbacks)
        // to include the accessToken.
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
            // Error state is set within authenticateWithBackend
            console.error('Backend authentication failed after Google sign-in.');
        }
      } else if (status === 'loading') {
          console.log('NextAuth session status: loading...');
          setIsAuthLoading(true); // Indicate loading while session is checked
      } else if (status === 'unauthenticated' && isAuthLoading) {
          // If session becomes unauthenticated while we were loading, stop loading.
          setIsAuthLoading(false);
      }
    };

    handleSessionChange();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, status, authenticateWithBackend, router]); // Rerun when session/status changes

  // Return loading state and error state/setter for the component to use
  return { isAuthLoading, authError, setAuthError };
}