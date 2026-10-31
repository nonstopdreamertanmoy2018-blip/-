const TOKEN_KEY = 'ng_erp_access_token';

function safeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return window.fetch.call(window, input, init);
}

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string | null): void {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function loginWithPassword(username: string, password: string): Promise<string> {
  const body = new URLSearchParams();
  body.set('username', username);
  body.set('password', password);

  const res = await safeFetch('/api/auth/token', {
    method: 'POST',
    headers: {'Content-Type': 'application/x-www-form-urlencoded'},
    body: body.toString(),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({detail: 'Authentication failed'}));
    throw new ApiError(res.status, typeof data.detail === 'string' ? data.detail : 'Authentication failed');
  }

  const json = (await res.json()) as {access_token: string};
  setStoredToken(json.access_token);
  return json.access_token;
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  if (init.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await safeFetch(`/api${path}`, {
    ...init,
    headers,
  });

  if (!res.ok) {
    const errPayload = await res.json().catch(() => ({detail: `Request failed (${res.status})`}));
    let message = `Request failed (${res.status})`;
    if (typeof errPayload?.detail === 'string') {
      message = errPayload.detail;
    } else if (Array.isArray(errPayload?.detail) && errPayload.detail.length > 0) {
      message = errPayload.detail.map((e: {msg?: string}) => e.msg || 'Validation error').join('; ');
    }
    throw new ApiError(res.status, message);
  }

  return (await res.json()) as T;
}

export async function apiDownloadFile(path: string, fallbackFilename: string): Promise<void> {
  const token = getStoredToken();
  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await safeFetch(`/api${path}`, {method: 'GET', headers});
  if (!res.ok) {
    const errPayload = await res.json().catch(() => ({detail: `Download failed (${res.status})`}));
    throw new ApiError(
      res.status,
      typeof errPayload?.detail === 'string' ? errPayload.detail : `Download failed (${res.status})`,
    );
  }

  const disposition = res.headers.get('Content-Disposition') || '';
  const match = disposition.match(/filename="?([^"]+)"?/i);
  const filename = match?.[1] || fallbackFilename;

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export const api = {
  get: <T>(path: string) => apiRequest<T>(path, {method: 'GET'}),
  post: <T>(path: string, body?: unknown) =>
    apiRequest<T>(path, {method: 'POST', body: body !== undefined ? JSON.stringify(body) : undefined}),
  put: <T>(path: string, body?: unknown) =>
    apiRequest<T>(path, {method: 'PUT', body: body !== undefined ? JSON.stringify(body) : undefined}),
  patch: <T>(path: string, body?: unknown) =>
    apiRequest<T>(path, {method: 'PATCH', body: body !== undefined ? JSON.stringify(body) : undefined}),
  del: <T>(path: string) => apiRequest<T>(path, {method: 'DELETE'}),
};
