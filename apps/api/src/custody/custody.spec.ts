import { knownTenants, resolveTenant, tenantEnv } from '../common/tenant';
import { externalIdFor, loadCustodyConfig } from './custody.config';
import { formatUnits, toBaseUnits } from './units';

describe('tenants', () => {
  it('always includes the default tenant', () => {
    expect(knownTenants({ TENANTS: 'flick,kite' })).toEqual(['blip', 'flick', 'kite']);
    expect(knownTenants({})).toEqual(['blip']);
  });

  it('resolves the header, defaulting to blip and rejecting unknown brands', () => {
    const tenants = ['blip', 'flick'];
    expect(resolveTenant(undefined, tenants)).toBe('blip');
    expect(resolveTenant(' FLICK ', tenants)).toBe('flick');
    expect(() => resolveTenant('evil', tenants)).toThrow(/Unknown tenant/);
  });

  it('prefers a tenant-scoped variable over the shared one', () => {
    const env = { PRIVY_APP_ID: 'shared', PRIVY_APP_ID_FLICK: 'flick-app' };
    expect(tenantEnv(env, 'PRIVY_APP_ID', 'flick')).toBe('flick-app');
    expect(tenantEnv(env, 'PRIVY_APP_ID', 'kite')).toBe('shared');
  });
});

describe('custody config', () => {
  it('is off without Privy credentials and never live by default', () => {
    const config = loadCustodyConfig('blip', {});
    expect(config.appId).toBeNull();
    expect(config.liveTrading).toBe(false);
    expect(config.maxTradeUsd).toBe(250);
  });

  it('only goes live on an explicit "true", per tenant', () => {
    const env = { PRIVY_APP_ID: 'a', PRIVY_APP_SECRET: 's', CUSTODY_LIVE_TRADING: 'yes', CUSTODY_LIVE_TRADING_KITE: 'true' };
    expect(loadCustodyConfig('blip', env).liveTrading).toBe(false);
    expect(loadCustodyConfig('kite', env).liveTrading).toBe(true);
  });

  it('strips the dashboard prefix from the authorization key', () => {
    expect(loadCustodyConfig('blip', { PRIVY_AUTHORIZATION_KEY: 'wallet-auth:MIGH' }).authorizationKey).toBe('MIGH');
  });
});

describe('externalIdFor', () => {
  it('namespaces wallets by tenant and stays inside Privy’s charset', () => {
    expect(externalIdFor('flick', 'did:privy:cm3abc')).toBe('flick-cm3abc');
    expect(externalIdFor('blip', 'did:privy:a:b.c')).toMatch(/^[a-zA-Z0-9_-]+$/);
    expect(externalIdFor('blip', 'did:privy:' + 'x'.repeat(100))).toHaveLength(64);
  });
});

describe('unit conversion', () => {
  it('converts decimals without float rounding', () => {
    expect(toBaseUnits('0.1', 9)).toBe(BigInt(100_000_000));
    expect(toBaseUnits('1.5', 6)).toBe(BigInt(1_500_000));
    expect(toBaseUnits('42', 0)).toBe(BigInt(42));
    expect(() => toBaseUnits('0.1234567', 6)).toThrow(/decimal places/);
  });

  it('formats base units back', () => {
    expect(formatUnits(BigInt(1_500_000_000), 9)).toBe('1.5');
    expect(formatUnits(BigInt(5), 9)).toBe('0.000000005');
    expect(formatUnits(BigInt(42), 0)).toBe('42');
  });
});
