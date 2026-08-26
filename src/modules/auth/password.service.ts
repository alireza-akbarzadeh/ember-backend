import { Injectable, OnModuleInit } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import * as argon2 from 'argon2';

/**
 * OWASP's baseline argon2 parameters, type id (m=19 MiB, t=2, p=1). Raising
 * `memoryCost` is the cheapest way to harden this later — existing hashes stay
 * verifiable because the parameters are encoded in the hash string itself.
 */
const ARGON2_OPTIONS: argon2.HashOptions = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
};

@Injectable()
export class PasswordService implements OnModuleInit {
  /** Verified against when no user matched, so login timing is flat. */
  private decoyHash = '';

  async onModuleInit(): Promise<void> {
    this.decoyHash = await this.hash(randomBytes(32).toString('hex'));
  }

  hash(plaintext: string): Promise<string> {
    return argon2.hash(plaintext, ARGON2_OPTIONS);
  }

  /** `false` rather than throwing on a malformed/legacy hash. */
  async verify(hash: string, plaintext: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plaintext);
    } catch {
      return false;
    }
  }

  /**
   * Burns at the same time a real verifying would.
   *
   * Called when the email doesn't exist, so an attacker can't tell registered
   * addresses from unregistered ones by response latency.
   */
  async verifyDecoy(): Promise<void> {
    await this.verify(this.decoyHash, 'not-the-password');
  }
}
