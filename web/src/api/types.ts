export type Role = 'ADMIN' | 'AGENT' | 'CUSTOMER';

export interface User {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  organisationId: string;
}

export interface AuthResult {
  accessToken: string;
  user: User;
}

export interface RegisterInput {
  organisationName: string;
  fullName: string;
  email: string;
  password: string;
}