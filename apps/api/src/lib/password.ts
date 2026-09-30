import bcrypt from 'bcrypt';

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(password: string, hash: string): Promise<boolean>;
  /**
   * Does the work of `verify` against a throwaway hash. Call it when there is no account,
   * so response times do not reveal which emails are registered.
   */
  verifyAgainstDummy(password: string): Promise<void>;
}

export function createPasswordHasher(cost: number): PasswordHasher {
  let dummyHash: Promise<string> | undefined;

  return {
    hash: (password) => bcrypt.hash(password, cost),
    verify: (password, hash) => bcrypt.compare(password, hash),
    async verifyAgainstDummy(password) {
      dummyHash ??= bcrypt.hash('formyx-timing-equaliser', cost);
      await bcrypt.compare(password, await dummyHash);
    },
  };
}
