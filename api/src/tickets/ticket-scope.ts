import type { AuthUser } from '../auth/auth.types.js';

// Every ticket query starts from this: the company always comes from the
// token, and customers can only ever see tickets they requested themselves.
export function scopeFor(actor: AuthUser): {
  organisationId: string;
  requesterId?: string;
} {
  return actor.role === 'CUSTOMER'
    ? { organisationId: actor.organisationId, requesterId: actor.id }
    : { organisationId: actor.organisationId };
}