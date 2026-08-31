// Generado por `npm run contracts:sync` — NO EDITAR A MANO.
// Espejo de esavi-backend/src/types/common/audit.types.ts
// Lo escrito a mano va en src/contracts/declared/ (CONVENTIONS.md §3, §9).

export interface SysDetails {
    version?: number;
    createdBy: string;
    updatedBy?: string;
    deletedBy?: string;
    auditTrail: AuditEntry[];
}

interface AuditEntry {
    actor?: string;
    request?: object;
    operation?: string;
    ocurredAt?: Date;
}

export interface AppDetails {
    createdAt: Date;
    user: string;
    method: string;
    detail: string;
}