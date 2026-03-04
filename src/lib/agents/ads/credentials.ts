/**
 * Credentials Encryption/Decryption
 * Uses AES-256-GCM for secure storage of ad platform credentials
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const key = process.env.CREDENTIALS_ENCRYPTION_KEY;
  if (!key) {
    throw new Error('CREDENTIALS_ENCRYPTION_KEY environment variable not set');
  }
  // Ensure key is exactly 32 bytes (256 bits)
  return Buffer.from(key.padEnd(32, '0').slice(0, 32));
}

/**
 * Encrypt credentials object to a single string for storage
 */
export function encryptCredentials(credentials: Record<string, unknown>): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);

  const cipher = createCipheriv(ALGORITHM, key, iv);

  const plaintext = JSON.stringify(credentials);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  // Combine: iv + authTag + encrypted data
  const combined = Buffer.concat([iv, authTag, encrypted]);
  return combined.toString('base64');
}

/**
 * Decrypt credentials string back to object
 */
export function decryptCredentials(encryptedString: string): Record<string, unknown> {
  const key = getEncryptionKey();
  const combined = Buffer.from(encryptedString, 'base64');

  // Extract: iv + authTag + encrypted data
  const iv = combined.subarray(0, IV_LENGTH);
  const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);

  return JSON.parse(decrypted.toString('utf8'));
}

/**
 * Validate that we can round-trip encrypt/decrypt
 */
export function validateEncryption(): boolean {
  try {
    const testData = { test: 'value', nested: { key: 123 } };
    const encrypted = encryptCredentials(testData);
    const decrypted = decryptCredentials(encrypted);
    return JSON.stringify(testData) === JSON.stringify(decrypted);
  } catch {
    return false;
  }
}
