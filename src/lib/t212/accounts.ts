/**
 * Trading 212 issues one API key pair per account: a key generated while the
 * ISA is selected can only ever read the ISA. Pulling both the ISA and the
 * Invest account therefore means holding several credential pairs and syncing
 * each one separately.
 *
 * Config shape (`.env.local`):
 *
 *   T212_ACCOUNTS=isa,invest
 *   T212_ISA_API_KEY=...        T212_ISA_API_SECRET=...
 *   T212_INVEST_API_KEY=...     T212_INVEST_API_SECRET=...
 *
 * The slug is what lands in every synced row's `account_id`, so it must stay
 * stable across syncs — `runT212Sync` refuses to reuse a slug whose credentials
 * have started pointing at a different Trading 212 account.
 */

export interface T212Account {
  /** Config slug, stored as `account_id` on every row this account contributes. */
  id: string;
  /** Env var prefix the credentials came from, for error messages. */
  envPrefix: string;
  apiKey: string;
  apiSecret: string;
}

export class T212ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'T212ConfigError';
  }
}

/** Slug used when only the legacy single-account `T212_API_KEY` pair is set. */
export const LEGACY_ACCOUNT_ID = 'default';

const SLUG_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;

function envPrefixFor(id: string): string {
  return `T212_${id.toUpperCase().replace(/-/g, '_')}`;
}

function readEnv(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : undefined;
}

function parseSlugs(raw: string): string[] {
  const slugs = raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);

  if (slugs.length === 0) {
    throw new T212ConfigError('T212_ACCOUNTS is set but lists no account names.');
  }

  for (const slug of slugs) {
    if (!SLUG_PATTERN.test(slug)) {
      throw new T212ConfigError(
        `Invalid account name "${slug}" in T212_ACCOUNTS. Use letters, digits, "-" or "_" (e.g. "isa,invest").`,
      );
    }
  }

  const seen = new Set<string>();
  for (const slug of slugs) {
    if (seen.has(slug)) {
      throw new T212ConfigError(`Account name "${slug}" is listed twice in T212_ACCOUNTS.`);
    }
    seen.add(slug);
  }

  return slugs;
}

/**
 * Every configured account, in T212_ACCOUNTS order.
 *
 * Falls back to the pre-multi-account `T212_API_KEY`/`T212_API_SECRET` pair so
 * an existing `.env.local` keeps working untouched.
 */
export function getAccounts(): T212Account[] {
  const list = readEnv('T212_ACCOUNTS');

  if (!list) {
    const apiKey = readEnv('T212_API_KEY');
    const apiSecret = readEnv('T212_API_SECRET');
    if (!apiKey || !apiSecret) {
      throw new T212ConfigError(
        'No Trading 212 credentials found. Set T212_API_KEY and T212_API_SECRET in .env.local, ' +
          'or list several accounts with T212_ACCOUNTS=isa,invest plus T212_ISA_API_KEY / T212_ISA_API_SECRET etc.',
      );
    }
    return [{ id: LEGACY_ACCOUNT_ID, envPrefix: 'T212', apiKey, apiSecret }];
  }

  return parseSlugs(list).map((id) => {
    const envPrefix = envPrefixFor(id);
    const apiKey = readEnv(`${envPrefix}_API_KEY`);
    const apiSecret = readEnv(`${envPrefix}_API_SECRET`);
    if (!apiKey || !apiSecret) {
      throw new T212ConfigError(
        `Account "${id}" is listed in T212_ACCOUNTS but ${envPrefix}_API_KEY and ${envPrefix}_API_SECRET are not both set.`,
      );
    }
    return { id, envPrefix, apiKey, apiSecret };
  });
}
