/** Error returned by the SAHAASRA API, with the HTTP status for callers that branch on it. */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Fired when the server says the session is gone, so the app can return to sign-in. */
export const SESSION_EXPIRED_EVENT = 'sahaasra:session-expired';
/** Fired when the server says the business's plan must be bought or renewed. */
export const PLAN_REQUIRED_EVENT = 'sahaasra:plan-required';

type Query = Record<string, string | number | boolean | undefined | null>;

function withQuery(path: string, query?: Query) {
  if (!query) return path;
  const qs = new URLSearchParams();
  Object.entries(query).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
  });
  const s = qs.toString();
  return s ? `${path}?${s}` : path;
}

async function request<T>(method: string, path: string, body?: unknown, query?: Query): Promise<T> {
  const isForm = body instanceof FormData;
  let res: Response;
  try {
    res = await fetch(`/api${withQuery(path, query)}`, {
      method,
      credentials: 'same-origin',
      headers: {
        // Mutations must carry this header (server-side CSRF protection).
        'x-sahaasra-client': 'web',
        ...(body !== undefined && !isForm ? { 'content-type': 'application/json' } : {}),
      },
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'Cannot reach the SAHAASRA server. Check your connection and try again.');
  }
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    const message = (data && typeof data === 'object' && 'error' in data && String((data as { error: unknown }).error)) || `Request failed (${res.status})`;
    if (res.status === 401 && !path.startsWith('/auth/')) window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    // The plan ran out: re-read the session so the app moves to the plan page.
    if (res.status === 402) window.dispatchEvent(new Event(PLAN_REQUIRED_EVENT));
    throw new ApiError(res.status, message, (data as { details?: unknown } | null)?.details);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string, query?: Query) => request<T>('GET', path, undefined, query),
  post: <T>(path: string, body: unknown = {}) => request<T>('POST', path, body),
  put: <T>(path: string, body: unknown) => request<T>('PUT', path, body),
  patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, body),
  del: <T>(path: string, body?: unknown) => request<T>('DELETE', path, body),
  upload: <T>(path: string, file: File, query?: Query) => {
    const form = new FormData();
    form.append('file', file);
    return request<T>('POST', withQuery(path, query), form);
  },
};

/** Standard REST resource: list / get / create / update / remove. */
export function resource<T extends { id: string }, TInput = Omit<T, 'id'>>(path: string) {
  return {
    list: () => api.get<T[]>(path),
    get: (id: string) => api.get<T>(`${path}/${id}`),
    create: (data: TInput) => api.post<T>(path, data),
    update: (id: string, patch: Partial<TInput>) => api.put<T>(`${path}/${id}`, patch),
    remove: (id: string) => api.del<{ id: string }>(`${path}/${id}`),
  };
}
