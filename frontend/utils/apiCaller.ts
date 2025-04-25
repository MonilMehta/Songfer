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
    ...(token && { Authorization: `Token ${token}` }),
    ...options.headers
  };

  try {
    const response = await axios({
      url: `${apiBaseUrl}${endpoint}`,
      method,
      headers,
      data: body,
      responseType: options.responseType || 'json',
      withCredentials: true, // This is correct for credentials/cookies
    });
    return response;
  } catch (error: any) {
    console.error('API call error:', error);

    if (error.message && error.message.includes('Network Error')) {
      console.warn('This appears to be a CORS issue. Make sure your backend has CORS properly configured.');
    }

    throw error;
  }
}