import axios from 'axios';

const apiBaseUrl = 'http://127.0.0.1:8000//api/';

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
    });
    return response;
  } catch (error) {
    console.error('API call error:', error);
    throw error;
  }
}