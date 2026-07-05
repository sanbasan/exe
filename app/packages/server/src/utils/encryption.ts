import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16;

export const isEncrypted = (text: string): boolean =>
  /^[0-9a-fA-F]{32}:[0-9a-fA-F]+$/u.test(text);

export const encrypt = ({
  encryptionKey,
  text,
}: {
  readonly encryptionKey: string;
  readonly text: string;
}): string => {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(
    ALGORITHM,
    Buffer.from(encryptionKey, 'hex'),
    iv
  );
  const encrypted = Buffer.concat([cipher.update(text), cipher.final()]);

  return `${iv.toString('hex')}:${encrypted.toString('hex')}`;
};

export const decrypt = ({
  encryptionKey,
  text,
}: {
  readonly encryptionKey?: string;
  readonly text: string;
}): string => {
  if (!isEncrypted(text)) {
    return text;
  }

  if (encryptionKey === undefined || encryptionKey.length === 0) {
    throw new Error('ENCRYPTION_KEY is required to decrypt Slack token.');
  }

  const [ivHex, encryptedHex] = text.split(':');

  if (ivHex === undefined || encryptedHex === undefined) {
    throw new Error('Invalid encrypted text format.');
  }

  const decipher = createDecipheriv(
    ALGORITHM,
    Buffer.from(encryptionKey, 'hex'),
    Buffer.from(ivHex, 'hex')
  );
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedHex, 'hex')),
    decipher.final(),
  ]);

  return decrypted.toString();
};
