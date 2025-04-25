import axios from 'axios';

const apiBaseUrl = 'https://songporter.onrender.com/api/';

interface ApiCallerOptions {
  responseType?: 'json' | 'blob' | 'arraybuffer';
  headers?: Record<string, string>;
}

export default async function apiCaller(
  endpoint: string, 
  method: string, 
  body?: any, 
  options: ApiCallerOptions = {}
) {
  if (typeof window === 'undefined') {
    return;
  }

  const token = localStorage.getItem('token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    // Add required CORS headers
    'Access-Control-Allow-Origin': 'https://songfer.vercel.app',
    'Access-Control-Allow-Credentials': 'true',
    ...(token && { Authorization: `Token ${token}` }),
    ...options.headers
  };

  try {
    // For non-GET requests, first send a preflight OPTIONS request to check CORS
    if (method.toUpperCase() !== 'GET' && method.toUpperCase() !== 'HEAD') {
      try {
        await axios({
          url: `${apiBaseUrl}${endpoint}`,
          method: 'OPTIONS',
          headers: {
            'Access-Control-Request-Method': method,
            'Access-Control-Request-Headers': 'Content-Type, Authorization',
            'Origin': 'https://songfer.vercel.app'
          }
        });
      } catch (preflightError) {
        console.warn('Preflight request failed:', preflightError);
        // Continue anyway, as the actual request might still succeed
      }
    }

    const response = await axios({
      url: `${apiBaseUrl}${endpoint}`,
      method,
      headers,
      data: body,
      responseType: options.responseType || 'json',
      withCredentials: true, // Important for CORS with credentials
    });
    return response;
  } catch (error) {
    console.error('API call error:', error);
    
    // Handle CORS errors specifically
    if (error.message && error.message.includes('Network Error')) {
      console.warn('This appears to be a CORS issue. Make sure your backend has CORS properly configured.');
    }
    
    throw error;
  }
}