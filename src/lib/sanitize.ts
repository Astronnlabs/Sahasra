/**
 * React escapes text content by default; this strips control characters and
 * trims oversized user input before it is stored or echoed back in the UI.
 */
export function sanitizeText(value: string, maxLength = 500) {
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, maxLength);
}

export function isSafeImageFile(file: File, maxBytes = 5 * 1024 * 1024) {
  return ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'].includes(file.type) && file.size <= maxBytes;
}
