// Crockford Base32 — `0123456789ABCDEFGHJKMNPQRSTVWXYZ`, without `I`, `L`, `O` or `U` (SPEC FE10
// §3.5) — chosen to survive being dictated over the phone, where those four letters are the ones
// most often confused with a digit or with each other.
const CROCKFORD_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const SUFFIX_LENGTH = 4;
const MAX_ATTEMPTS = 3;

const PROVISIONAL_DOCUMENT_REGEX = new RegExp(
  `^PROV-\\d{8}-[${CROCKFORD_ALPHABET}]{${SUFFIX_LENGTH}}$`,
);

function randomSuffix(): string {
  let suffix = '';
  for (let i = 0; i < SUFFIX_LENGTH; i++) {
    suffix += CROCKFORD_ALPHABET[Math.floor(Math.random() * CROCKFORD_ALPHABET.length)];
  }
  return suffix;
}

function compactIsoDate(now: Date): string {
  const year = now.getFullYear();
  const month = `${now.getMonth() + 1}`.padStart(2, '0');
  const day = `${now.getDate()}`.padStart(2, '0');
  return `${year}${month}${day}`;
}

// Generated in the client — there's no endpoint that mints it (SPEC FE10 §3.5). Already uppercase
// with no surrounding whitespace, so it survives `normalizeDocument` (`trim().toUpperCase()`,
// patient.service.ts) unchanged, which is what lets a later `006` search find it back by exact
// match.
export function generateProvisionalDocument(now: Date = new Date()): string {
  return `PROV-${compactIsoDate(now)}-${randomSuffix()}`;
}

export function isProvisionalDocumentNumber(value: string): boolean {
  return PROVISIONAL_DOCUMENT_REGEX.test(value.trim().toUpperCase());
}

export interface ProvisionalDocumentRetryOptions {
  // The value the "sin documento" checkbox already generated and showed, disabled, in
  // `documentNumber` (SPEC FE10 §5: "Marcar «sin documento» genera un PROV-..." — the generation
  // happens at check time, not at submit time). The first attempt reuses it exactly, so what the
  // user saw in the field is what actually gets sent; only a collision regenerates a new one, and
  // only then does the identifier the confirmation dialog shows differ from what was on screen.
  initialDocumentNumber: string;
  maxAttempts?: number;
}

// The retry rule of SPEC FE10 §3.5 and §7 riesgo: a `409` on a `PROV-` is a collision, not a
// finding (unlike a `409` on a document the user typed themselves) — regenerate and try again, up
// to `maxAttempts` identifiers total. With four Crockford symbols there are ~1M combinations per
// day, so a collision is already unlikely; this is what turns that into a guaranteed behavior
// instead of a hope. `isCollision` stays the caller's call: only whoever built the request body
// knows whether the document that just got rejected was the provisional one or something the user
// actually typed.
export async function createWithProvisionalDocumentRetry<T>(
  submit: (documentNumber: string) => Promise<T>,
  isCollision: (error: unknown) => boolean,
  options: ProvisionalDocumentRetryOptions,
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? MAX_ATTEMPTS;
  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const documentNumber = attempt === 0 ? options.initialDocumentNumber : generateProvisionalDocument();
    try {
      return await submit(documentNumber);
    } catch (error) {
      lastError = error;
      if (!isCollision(error)) {
        throw error;
      }
    }
  }
  throw lastError;
}
