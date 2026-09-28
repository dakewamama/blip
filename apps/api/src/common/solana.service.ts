import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';

export const TOKEN_PROGRAM = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
/** pump.fun now mints a lot of supply under Token-2022; querying only the legacy
 *  program silently hides those balances from a user's portfolio. */
export const TOKEN_2022_PROGRAM = new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');

export interface ParsedTokenAccount {
  mint: string;
  amount: number;
  decimals: number;
  program: 'token' | 'token-2022';
}

export interface MintAuthorities {
  mintAuthority: string | null;
  freezeAuthority: string | null;
  supply: string;
  decimals: number;
}

@Injectable()
export class SolanaService {
  private readonly logger = new Logger(SolanaService.name);
  readonly connection: Connection;

  constructor(config: ConfigService) {
    const rpcUrl = config.get<string>('SOLANA_RPC_URL') || 'https://api.mainnet-beta.solana.com';
    this.connection = new Connection(rpcUrl, {
      commitment: 'confirmed',
      // web3.js otherwise retries a 429 with internal exponential backoff, which
      // turns a rate-limited holder lookup into a 60s hang the caller cannot
      // cancel. Fail fast and let the score degrade instead.
      disableRetryOnRateLimit: true,
      fetch: (input: any, init: any) => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 8000);
        return fetch(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
      },
    });
  }

  isValidAddress(address: string): boolean {
    try {
      new PublicKey(address);
      return true;
    } catch {
      return false;
    }
  }

  async getSolBalance(address: string): Promise<number> {
    const lamports = await this.connection.getBalance(new PublicKey(address));
    return lamports / LAMPORTS_PER_SOL;
  }

  /** Reads both token programs and merges the result. */
  async getTokenAccounts(address: string): Promise<ParsedTokenAccount[]> {
    const owner = new PublicKey(address);

    const [legacy, token2022] = await Promise.allSettled([
      this.connection.getParsedTokenAccountsByOwner(owner, { programId: TOKEN_PROGRAM }),
      this.connection.getParsedTokenAccountsByOwner(owner, { programId: TOKEN_2022_PROGRAM }),
    ]);

    const out: ParsedTokenAccount[] = [];

    const collect = (
      result: PromiseSettledResult<Awaited<ReturnType<Connection['getParsedTokenAccountsByOwner']>>>,
      program: 'token' | 'token-2022',
    ) => {
      if (result.status !== 'fulfilled') {
        this.logger.warn(`${program} account lookup failed: ${result.reason?.message}`);
        return;
      }
      for (const account of result.value.value) {
        const info = (account.account.data as any).parsed?.info;
        if (!info) continue;
        const amount = Number(info.tokenAmount?.uiAmount ?? 0);
        if (amount <= 0) continue; // skip dust and closed accounts
        out.push({
          mint: info.mint,
          amount,
          decimals: Number(info.tokenAmount?.decimals ?? 0),
          program,
        });
      }
    };

    collect(legacy, 'token');
    collect(token2022, 'token-2022');
    return out;
  }

  /** Mint authority / freeze authority — the two hard rug signals. */
  async getMintAuthorities(mint: string): Promise<MintAuthorities | null> {
    try {
      const info = await this.connection.getParsedAccountInfo(new PublicKey(mint));
      const parsed = (info.value?.data as any)?.parsed?.info;
      if (!parsed) return null;
      return {
        mintAuthority: parsed.mintAuthority ?? null,
        freezeAuthority: parsed.freezeAuthority ?? null,
        supply: String(parsed.supply ?? '0'),
        decimals: Number(parsed.decimals ?? 0),
      };
    } catch (error: any) {
      this.logger.warn(`Mint authority lookup failed for ${mint}: ${error.message}`);
      return null;
    }
  }

  /** Top holders, used for concentration risk. */
  async getLargestHolders(mint: string): Promise<{ address: string; uiAmount: number }[]> {
    try {
      const res = await this.connection.getTokenLargestAccounts(new PublicKey(mint));
      return res.value.map((a) => ({ address: a.address.toBase58(), uiAmount: Number(a.uiAmount ?? 0) }));
    } catch (error: any) {
      this.logger.warn(`Largest-holder lookup failed for ${mint}: ${error.message}`);
      return [];
    }
  }

  /** Broadcast an already-signed transaction and wait for confirmation. */
  async submitSignedTransaction(base64Tx: string): Promise<{ signature: string; slot: number | null }> {
    const raw = Buffer.from(base64Tx, 'base64');
    const signature = await this.connection.sendRawTransaction(raw, {
      skipPreflight: false,
      maxRetries: 3,
    });

    const latest = await this.connection.getLatestBlockhash('confirmed');
    const result = await this.connection.confirmTransaction(
      { signature, blockhash: latest.blockhash, lastValidBlockHeight: latest.lastValidBlockHeight },
      'confirmed',
    );

    if (result.value.err) {
      throw new Error(`Transaction reverted on-chain: ${JSON.stringify(result.value.err)}`);
    }

    return { signature, slot: result.context?.slot ?? null };
  }
}
