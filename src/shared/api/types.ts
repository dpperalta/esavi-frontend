// The envelope from API-CONTRACT.md §2 — client.ts is the only module that sees it. Everything
// else receives `data` already unwrapped, or an EsaviApiError.
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

// Keeps `code` and `status` (API-CONTRACT.md §2). `errors` is never shown to the user
// (CONVENTIONS.md §6.2), so it isn't stored here either — nothing should read it.
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
