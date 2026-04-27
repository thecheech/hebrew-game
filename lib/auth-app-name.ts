/** Same default as magic-link email (`auth.ts`). Override with `AUTH_APP_NAME`. */
export function authAppDisplayName() {
  return process.env.AUTH_APP_NAME ?? "Bar Mitzva App";
}
