export type PasswordRule = { label: string; ok: boolean }

export function checkPassword(pwd: string): PasswordRule[] {
  return [
    { label: "Minimal 8 karakter",      ok: pwd.length >= 8 },
    { label: "Huruf kecil (a-z)",        ok: /[a-z]/.test(pwd) },
    { label: "Huruf besar (A-Z)",        ok: /[A-Z]/.test(pwd) },
    { label: "Angka (0-9)",              ok: /[0-9]/.test(pwd) },
  ]
}

export function passwordStrength(pwd: string): 0 | 1 | 2 | 3 | 4 {
  return checkPassword(pwd).filter((r) => r.ok).length as 0 | 1 | 2 | 3 | 4
}

export function isPasswordValid(pwd: string): boolean {
  return checkPassword(pwd).every((r) => r.ok)
}
