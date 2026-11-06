import crypto from 'crypto';
import { env } from '../config/env';

// AES-256-GCM encryption for Wi-Fi passwords
// Key must be 32 bytes from ENCRYPTION_KEY env var

function getKey(): Buffer {
  const key = env.ENCRYPTION_KEY;
  // If hex string of 64 chars, use as hex; else use as utf8 and pad/hash
  if (key.length === 64 && /^[0-9a-fA-F]+$/.test(key)) {
    return Buffer.from(key, 'hex');
  }
  return crypto.createHash('sha256').update(key).digest();
}

export function encryptPassword(plaintext: string): { encrypted: string; iv: string; tag: string } {
  const key = getKey();
  const iv = crypto.randomBytes(12); // 96-bit IV for GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag();
  
  return {
    encrypted,
    iv: iv.toString('hex'),
    tag: tag.toString('hex'),
  };
}

export function decryptPassword(encrypted: string, iv: string, tag: string): string {
  const key = getKey();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'hex'));
  decipher.setAuthTag(Buffer.from(tag, 'hex'));
  
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}
