import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getAccounts, LEGACY_ACCOUNT_ID, T212ConfigError } from '../accounts';

/**
 * Credential mix-ups are the expensive failure here: a slug pointing at the
 * wrong key pair mislabels history that the dashboard then pools into one
 * portfolio. These tests pin the parsing and the error messages that catch it.
 */
const T212_VARS = /^T212_/;

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const key of Object.keys(process.env)) {
    if (T212_VARS.test(key)) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
  }
});

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (T212_VARS.test(key)) delete process.env[key];
  }
  for (const [key, value] of Object.entries(saved)) {
    if (value !== undefined) process.env[key] = value;
  }
});

describe('getAccounts', () => {
  it('falls back to the legacy single key pair when T212_ACCOUNTS is unset', () => {
    process.env.T212_API_KEY = 'key';
    process.env.T212_API_SECRET = 'secret';

    expect(getAccounts()).toEqual([
      { id: LEGACY_ACCOUNT_ID, envPrefix: 'T212', apiKey: 'key', apiSecret: 'secret' },
    ]);
  });

  it('resolves one credential pair per named account, in listed order', () => {
    process.env.T212_ACCOUNTS = 'isa, invest';
    process.env.T212_ISA_API_KEY = 'isa-key';
    process.env.T212_ISA_API_SECRET = 'isa-secret';
    process.env.T212_INVEST_API_KEY = 'invest-key';
    process.env.T212_INVEST_API_SECRET = 'invest-secret';

    expect(getAccounts()).toEqual([
      { id: 'isa', envPrefix: 'T212_ISA', apiKey: 'isa-key', apiSecret: 'isa-secret' },
      { id: 'invest', envPrefix: 'T212_INVEST', apiKey: 'invest-key', apiSecret: 'invest-secret' },
    ]);
  });

  it('ignores the legacy pair once accounts are named explicitly', () => {
    process.env.T212_API_KEY = 'stale';
    process.env.T212_API_SECRET = 'stale';
    process.env.T212_ACCOUNTS = 'isa';
    process.env.T212_ISA_API_KEY = 'isa-key';
    process.env.T212_ISA_API_SECRET = 'isa-secret';

    expect(getAccounts().map((a) => a.apiKey)).toEqual(['isa-key']);
  });

  it('uppercases the slug and maps "-" to "_" when deriving env var names', () => {
    process.env.T212_ACCOUNTS = 'joint-isa';
    process.env.T212_JOINT_ISA_API_KEY = 'k';
    process.env.T212_JOINT_ISA_API_SECRET = 's';

    expect(getAccounts()[0]).toMatchObject({ id: 'joint-isa', envPrefix: 'T212_JOINT_ISA' });
  });

  it('names the missing variables when an account has no credentials', () => {
    process.env.T212_ACCOUNTS = 'isa,invest';
    process.env.T212_ISA_API_KEY = 'isa-key';
    process.env.T212_ISA_API_SECRET = 'isa-secret';

    expect(() => getAccounts()).toThrow(T212ConfigError);
    expect(() => getAccounts()).toThrow(/T212_INVEST_API_KEY and T212_INVEST_API_SECRET/);
  });

  it('rejects an account listed twice', () => {
    process.env.T212_ACCOUNTS = 'isa,isa';
    process.env.T212_ISA_API_KEY = 'k';
    process.env.T212_ISA_API_SECRET = 's';

    expect(() => getAccounts()).toThrow(/listed twice/);
  });

  it('rejects slugs that cannot form an env var name', () => {
    process.env.T212_ACCOUNTS = 'my account';

    expect(() => getAccounts()).toThrow(/Invalid account name/);
  });

  it('rejects an empty T212_ACCOUNTS list', () => {
    process.env.T212_ACCOUNTS = ' , ';

    expect(() => getAccounts()).toThrow(/lists no account names/);
  });

  it('explains both config shapes when nothing is set', () => {
    expect(() => getAccounts()).toThrow(/T212_ACCOUNTS=isa,invest/);
  });
});
