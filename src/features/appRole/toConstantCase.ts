// Exact mirror of esavi-backend/src/helpers/stringHandling.helper.ts:61-63, so the preview under
// `code` and `name` shows what the server will really store and not an idealized version of it.
//
// Every non-alphanumeric ASCII run becomes one underscore, which includes accented letters:
// `coordinación` is stored as `COORDINACI_N`. That is the surprise the preview exists to show
// before saving, not a bug to smooth over here — a client that "fixed" it would disagree with
// the value the backend compares in roleValidation.middleware.ts.
export function toConstantCase(text: string): string {
  return text.replace(/[^a-zA-Z0-9]+/g, '_').toUpperCase();
}
