import type { ToolResult } from '../../types';

export function encodeBase64(text: string): ToolResult {
  try {
    const bytes = new TextEncoder().encode(text);
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return { ok: true, value: btoa(binary) };
  } catch {
    return { ok: false, error: '인코딩에 실패했습니다.' };
  }
}

export function decodeBase64(b64: string): ToolResult {
  const cleaned = b64.replace(/\s+/g, '');
  if (cleaned === '') return { ok: true, value: '' };

  let binary: string;
  try {
    binary = atob(cleaned);
  } catch {
    return { ok: false, error: 'Base64 형식이 아닙니다. 허용되지 않는 문자가 들어 있습니다.' };
  }

  const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
  try {
    return { ok: true, value: new TextDecoder('utf-8', { fatal: true }).decode(bytes) };
  } catch {
    return { ok: false, error: 'UTF-8 텍스트로 해석할 수 없습니다. 바이너리 데이터일 수 있습니다.' };
  }
}
