// NO es espejo: el backend construye estas dos respuestas como literales, sin ninguna
// `interface` que `contracts:sync` pueda copiar (SPEC FE01 §3.3). Se reconcilian a mano si el
// backend cambia; `contracts:sync` nunca escribe en esta carpeta.
import type { AppDetails } from '@/contracts/common';

// POST /api/auth/login (ESAVI-AUTH-001) — origen: esavi-backend/src/services/auth.service.ts:110-121
export interface LoginResponse {
  token: string;
  refreshToken: string;
  expiresAt: string;
  user: {
    userId: string;
    email: string;
    displayName: string;
    // Sin `level`: la respuesta del login no autoriza nada (SPEC FE01 §1, hallazgo A).
    // ['user', 'me'] / CurrentUser de abajo es la única fuente del nivel efectivo.
    roles: Array<{ roleId: string; name: string; code: string }>;
  };
}

// GET /api/users/me (ESAVI-USER-007) — origen: user.service.ts:54-59 (toUserResponse, sobre
// AppUser.toJSON() menos passwordHash y sysDetails) + :26-31 (ROLES_INCLUDE, con level).
// Modelo verificado en esavi-backend/src/models/appUser.model.ts.
export interface CurrentUser {
  userId: string;
  username: string | null;
  email: string;
  externalProvider: string | null;
  externalSubject: string | null;
  displayName: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  requiresPasswordChange: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string | null;
  deletedAt: string | null;
  appDetails: AppDetails[];
  roles: Array<{ roleId: string; name: string; code: string; level: number }>;
}
