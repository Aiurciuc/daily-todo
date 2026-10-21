import { randomBytes, scrypt as derive, timingSafeEqual } from 'node:crypto';

function scrypt(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    derive(password, salt, 64, { N: 16384, r: 8, p: 1 }, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  return `scrypt$${salt}$${(await scrypt(password, salt)).toString('hex')}`;
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const [algorithm, salt, key] = hash.split('$');
  if (algorithm !== 'scrypt' || !/^[a-f0-9]{32}$/.test(salt ?? '') || !/^[a-f0-9]{128}$/.test(key ?? '')) return false;
  return timingSafeEqual(await scrypt(password, salt), Buffer.from(key, 'hex'));
}
