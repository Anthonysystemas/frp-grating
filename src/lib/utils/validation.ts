const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validarCorreo(email: string): boolean {
  return EMAIL_REGEX.test(email.trim());
}
