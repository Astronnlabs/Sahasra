export const PK = {
  tenants: ['platform', 'tenants'] as const,
  users: ['platform', 'users'] as const,
  tickets: ['platform', 'tickets'] as const,
  overview: ['platform', 'overview'] as const,
  signups: (range: string) => ['platform', 'signups', range] as const,
  all: ['platform'] as const,
};
