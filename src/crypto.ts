const encoder = new TextEncoder();

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return bytesToHex(new Uint8Array(digest));
}

export async function verifyTiendanubeHmac(
  rawBody: string,
  receivedSignature: string | null,
  appSecret: string,
): Promise<boolean> {
  if (!receivedSignature || !/^[a-fA-F0-9]{64}$/.test(receivedSignature)) {
    return false;
  }

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(rawBody));
  return constantTimeEqual(bytesToHex(new Uint8Array(signature)), receivedSignature.toLowerCase());
}

export async function encryptSecret(
  plaintext: string,
  base64Key: string,
  associatedData: string,
): Promise<{ ciphertext: string; iv: string }> {
  const keyBytes = base64ToBytes(base64Key);
  if (keyBytes.byteLength !== 32) {
    throw new Error("invalid_credentials_encryption_key");
  }

  const keyMaterial = Uint8Array.from(keyBytes).buffer;
  const key = await crypto.subtle.importKey("raw", keyMaterial, "AES-GCM", false, ["encrypt"]);
  const iv = Uint8Array.from(crypto.getRandomValues(new Uint8Array(12)));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: encoder.encode(associatedData) },
    key,
    encoder.encode(plaintext),
  );

  return {
    ciphertext: bytesToBase64(new Uint8Array(encrypted)),
    iv: bytesToBase64(iv),
  };
}

export async function decryptSecret(
  ciphertext: string,
  iv: string,
  base64Key: string,
  associatedData: string,
): Promise<string> {
  const keyBytes = base64ToBytes(base64Key);
  if (keyBytes.byteLength !== 32) {
    throw new Error("invalid_credentials_encryption_key");
  }

  const key = await crypto.subtle.importKey(
    "raw",
    Uint8Array.from(keyBytes).buffer,
    "AES-GCM",
    false,
    ["decrypt"],
  );
  const plaintext = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: Uint8Array.from(base64ToBytes(iv)).buffer,
      additionalData: encoder.encode(associatedData),
    },
    key,
    Uint8Array.from(base64ToBytes(ciphertext)).buffer,
  );

  return new TextDecoder().decode(plaintext);
}

export function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

