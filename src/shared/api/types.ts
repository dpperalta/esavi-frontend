// El envelope de API-CONTRACT.md §2 — client.ts es el único que lo ve. Todo lo demás recibe
// `data` ya desenvuelto o un EsaviApiError.
export interface ApiSuccessEnvelope<T> {
  ok: true;
  message: string;
  data: T;
}

export interface ApiErrorEnvelope {
  ok: false;
  message: string;
  code: string;
  errors?: unknown;
}

// Conserva `code` y `status` (API-CONTRACT.md §2). `errors` nunca se muestra al usuario
// (CONVENTIONS.md §6.2) y por eso no se guarda aquí: nada debería leerlo.
export class EsaviApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = 'EsaviApiError';
    this.status = status;
    this.code = code;
  }
}
