import { Injectable, Logger, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { createPrivateKey, createPublicKey } from 'crypto';
import { PrivyClient } from '@privy-io/node';
import { knownTenants } from '../common/tenant';
import { CustodyConfig, externalIdFor, loadCustodyConfig } from './custody.config';

export interface CustodialWallet {
  /** Privy wallet ID — what signing calls address. */
  id: string;
  /** Solana address funds are held at. */
  address: string;
}

interface TenantCustody {
  config: CustodyConfig;
  client: PrivyClient | null;
  ownerPublicKey: string | null;
}

/**
 * Thin wrapper over Privy: who is calling, which wallet blip holds for them,
 * and signing with it. Nothing about trading lives here.
 *
 * The user → wallet mapping is kept in Privy itself, as the wallet's write-once
 * `external_id` (`<tenant>-<privy user>`), so there is no local table to lose on
 * a redeploy and no way for two records to disagree about whose wallet is whose.
 */
@Injectable()
export class PrivyService {
  private readonly logger = new Logger(PrivyService.name);
  private readonly tenants = new Map<string, TenantCustody>();
  /** Single-flight per user, so a double-tap on sign-up cannot mint two wallets. */
  private readonly inflight = new Map<string, Promise<CustodialWallet>>();

  constructor() {
    // Tenants sharing one Privy app share one client, so the JWKS cache is shared too.
    const clients = new Map<string, PrivyClient>();

    for (const tenant of knownTenants()) {
      const config = loadCustodyConfig(tenant);
      let client: PrivyClient | null = null;
      if (config.appId && config.appSecret) {
        const key = `${config.appId}:${config.appSecret}`;
        client = clients.get(key) ?? new PrivyClient({ appId: config.appId, appSecret: config.appSecret });
        clients.set(key, client);
      }
      const ownerPublicKey = config.authorizationKey ? publicKeyFor(config.authorizationKey) : null;
      this.tenants.set(tenant, { config, client, ownerPublicKey });

      this.logger.log(
        client
          ? `[${tenant}] custody on (app ${config.appId}, owner ${ownerPublicKey ? 'authorization key' : 'app secret only'}, live trading ${config.liveTrading ? 'ON' : 'off'})`
          : `[${tenant}] custody off — PRIVY_APP_ID / PRIVY_APP_SECRET not set, front end runs in demo mode`,
      );
    }
  }

  config(tenant: string): CustodyConfig {
    return this.entry(tenant).config;
  }

  enabled(tenant: string): boolean {
    return this.tenants.get(tenant)?.client != null;
  }

  private entry(tenant: string): TenantCustody {
    const entry = this.tenants.get(tenant);
    if (!entry) throw new ServiceUnavailableException(`Unknown tenant "${tenant}"`);
    return entry;
  }

  private client(tenant: string): PrivyClient {
    const { client } = this.entry(tenant);
    if (!client) throw new ServiceUnavailableException('Custody is not configured on this server');
    return client;
  }

  /** Verify a Privy access token and return the Privy user ID it was issued to. */
  async verify(tenant: string, accessToken: string): Promise<string> {
    const client = this.client(tenant);
    try {
      const claims = await client.utils().auth().verifyAccessToken(accessToken);
      return claims.user_id;
    } catch {
      throw new UnauthorizedException('Session expired — sign in again');
    }
  }

  /** The wallet blip holds for this user under this tenant, created on first call. */
  walletFor(tenant: string, userId: string): Promise<CustodialWallet> {
    const externalId = externalIdFor(tenant, userId);
    const pending = this.inflight.get(externalId);
    if (pending) return pending;
    const job = this.findOrCreate(tenant, externalId).finally(() => this.inflight.delete(externalId));
    this.inflight.set(externalId, job);
    return job;
  }

  private async findOrCreate(tenant: string, externalId: string): Promise<CustodialWallet> {
    const client = this.client(tenant);
    const { ownerPublicKey } = this.entry(tenant);

    const page = await client.wallets().list({ external_id: externalId, chain_type: 'solana' });
    const existing = page.data[0];
    if (existing) return { id: existing.id, address: existing.address };

    const created = await client.wallets().create({
      chain_type: 'solana',
      external_id: externalId,
      display_name: `${tenant} custody`,
      ...(ownerPublicKey ? { owner: { public_key: ownerPublicKey } } : {}),
      // Belt and braces with the single-flight above: a retry within 24h of a
      // create that succeeded upstream but timed out here returns the same wallet.
      idempotency_key: `custody-${externalId}`,
    });
    this.logger.log(`[${tenant}] created custodial wallet ${created.address} (${externalId})`);
    return { id: created.id, address: created.address };
  }

  /** Sign a base64 transaction with a custodial wallet. Does not broadcast. */
  async signTransaction(tenant: string, walletId: string, base64Tx: string): Promise<string> {
    const client = this.client(tenant);
    const { authorizationKey } = this.entry(tenant).config;
    const result = await client.wallets().solana().signTransaction(walletId, {
      transaction: base64Tx,
      ...(authorizationKey
        ? { authorization_context: { authorization_private_keys: [authorizationKey] } }
        : {}),
    });
    return result.signed_transaction;
  }
}

/** Base64 SPKI DER of the P-256 public key matching a base64 PKCS8 private key. */
function publicKeyFor(privateKeyBase64: string): string {
  const privateKey = createPrivateKey({ key: Buffer.from(privateKeyBase64, 'base64'), format: 'der', type: 'pkcs8' });
  return createPublicKey(privateKey).export({ format: 'der', type: 'spki' }).toString('base64');
}
