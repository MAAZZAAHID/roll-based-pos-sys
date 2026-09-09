const BASE = '/api';

function getToken(): string | null {
  return localStorage.getItem('pos_token');
}

export async function apiRequest<T = unknown>(
  method: string,
  path: string,
  body?: object,
  extraHeaders?: Record<string, string>
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (extraHeaders) Object.assign(headers, extraHeaders);

  const opts: RequestInit = { method, headers };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(`${BASE}${path}`, opts);

  if (res.status === 204) return undefined as T;

  const data = await res.json();
  if (!res.ok) {
    if (res.status === 401 && path !== '/auth/login') {
      localStorage.removeItem('pos_token');
      window.dispatchEvent(new Event('unauthorized_api'));
    }
    throw new Error(data?.message || `Request failed: ${res.status}`);
  }
  return data as T;
}

export const api = {
  get:    <T>(path: string)              => apiRequest<T>('GET',    path),
  post:   <T>(path: string, body: object, headers?: Record<string, string>) => apiRequest<T>('POST', path, body, headers),
  put:    <T>(path: string, body: object) => apiRequest<T>('PUT',    path, body),
  delete: <T>(path: string)              => apiRequest<T>('DELETE', path),
};
