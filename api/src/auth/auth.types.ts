import type { Request } from 'express';

export type UserRole = 'ADMIN' | 'AGENT' | 'CUSTOMER';

export interface AccessTokenPayload {
  sub: string;
  org: string;
  role: UserRole;
}

export interface AuthUser {
  id: string;
  organisationId: string;
  role: UserRole;
}

export type AuthenticatedRequest = Request & { user?: AuthUser };

export interface PublicUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  organisationId: string;
}

export interface AuthResult {
  accessToken: string;
  user: PublicUser;
}

export interface AuthSession extends AuthResult {
  refreshToken: string;
}