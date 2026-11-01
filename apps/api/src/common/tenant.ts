import { BadRequestException } from '@nestjs/common';

/**
 * One API serves several branded front ends. Each front end names itself in the
 * `x-blip-tenant` header; market data is shared, while custody — whose wallet,
 * which Privy app, which limits — is kept apart per tenant.
 *
 * The header is not a security boundary on its own: a caller who spoofs it
 * only reaches their own wallet under another brand, and when a tenant has its
 * own Privy app, tokens from any other app fail verification.
 */
export const TENANT_HEADER = 'x-blip-tenant';
export const DEFAULT_TENANT = 'blip';

export function knownTenants(env: NodeJS.ProcessEnv = process.env): string[] {
  const list = (env.TENANTS || DEFAULT_TENANT)
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(DEFAULT_TENANT) ? list : [DEFAULT_TENANT, ...list];
}

export function resolveTenant(header: string | string[] | undefined, tenants = knownTenants()): string {
  const raw = (Array.isArray(header) ? header[0] : header)?.trim().toLowerCase();
  if (!raw) return DEFAULT_TENANT;
  if (!tenants.includes(raw)) throw new BadRequestException(`Unknown tenant "${raw}"`);
  return raw;
}

/** `KEY_<TENANT>` when set, else `KEY` — e.g. PRIVY_APP_ID_FLICK over PRIVY_APP_ID. */
export function tenantEnv(env: NodeJS.ProcessEnv, key: string, tenant: string): string | undefined {
  const scoped = env[`${key}_${tenant.toUpperCase()}`];
  return scoped !== undefined && scoped !== '' ? scoped : env[key];
}
