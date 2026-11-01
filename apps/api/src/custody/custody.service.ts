import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import { SolanaService, TOKEN_2022_PROGRAM, TOKEN_PROGRAM } from '../common/solana.service';
import { PumpService } from '../pump/pump.service';
import { PortfolioService } from '../portfolio/portfolio.service';
import { PrivyService } from './privy.service';
import { CustodyCaller } from './custody.guard';
import { TradeDto, WithdrawDto } from './dto/custody.dto';
import { UnsafeTransactionError, assertSafeTradeTransaction } from './tx-guard';
import { formatUnits, toBaseUnits } from './units';

/** One signature's network fee, in lamports. */
const NETWORK_FEE_LAMPORTS = 5_000;
/** Enough SOL for a fee plus one token-account rent, for sells and token withdrawals. */
const MIN_SOL_FOR_TOKEN_OPS = 0.003;

/**
 * Everything that moves funds in a wallet blip holds. Each path re-derives the
 * numbers server-side — balance, quote, cap, price impact — rather than trusting
 * what the client showed, and only one transaction per wallet is in flight.
 */
@Injectable()
export class CustodyService {
  private readonly logger = new Logger(CustodyService.name);
  private readonly busy = new Set<string>();

  constructor(
    private readonly privy: PrivyService,
    private readonly solana: SolanaService,
    private readonly pump: PumpService,
    private readonly portfolio: PortfolioService,
  ) {}

  status(tenant: string) {
    const config = this.privy.config(tenant);
    const custody = this.privy.enabled(tenant);
    return {
      tenant,
      custody,
      liveTrading: custody && config.liveTrading,
      maxTradeUsd: config.maxTradeUsd,
      feeReserveSol: config.feeReserveSol,
    };
  }

  /** The caller's wallet (created on first sign-in) and what it holds. */
  async account(caller: CustodyCaller) {
    const wallet = await this.privy.walletFor(caller.tenant, caller.userId);
    const portfolio = await this.portfolio.getPortfolio(wallet.address);
    return { ...this.status(caller.tenant), address: wallet.address, portfolio };
  }

  async trade(caller: CustodyCaller, dto: TradeDto) {
    const config = this.privy.config(caller.tenant);
    if (!config.liveTrading) {
      throw new ForbiddenException('Live trading is switched off on this server');
    }
    const wallet = await this.privy.walletFor(caller.tenant, caller.userId);
    const slippageBps = dto.slippageBps ?? 100;

    return this.exclusive(wallet.address, async () => {
      const solBalance = await this.solana.getSolBalance(wallet.address);
      let amount = dto.amount;
      let sellAll = false;

      if (dto.action === 'sell') {
        const held = (await this.solana.getTokenAccounts(wallet.address)).find((a) => a.mint === dto.mint);
        if (!held) throw new BadRequestException('This wallet holds none of that token');
        if (amount > held.amount * (1 + 1e-9)) {
          throw new BadRequestException(`Wallet holds ${held.amount} — cannot sell ${amount}`);
        }
        // Selling (nearly) everything goes out as "100%" so no dust is stranded.
        if (amount >= held.amount * 0.999) {
          amount = held.amount;
          sellAll = true;
        }
        if (solBalance < MIN_SOL_FOR_TOKEN_OPS) {
          throw new BadRequestException(`Selling needs about ${MIN_SOL_FOR_TOKEN_OPS} SOL for network fees — deposit a little SOL first`);
        }
      }

      const result = await this.pump.getQuote(dto.mint, amount, dto.action, slippageBps);
      if (!result.success || !result.data) throw new BadRequestException(result.error ?? 'Quote failed');
      const quote = result.data;

      if (quote.highImpact) {
        throw new BadRequestException(`${(quote.priceImpact * 100).toFixed(1)}% price impact on that size — not placing it`);
      }
      if (!quote.solUsd) {
        throw new ServiceUnavailableException('No SOL price right now — refusing to size a trade blind');
      }

      if (dto.action === 'buy') {
        const usd = amount * quote.solUsd;
        const cap = Math.min(config.maxTradeUsd, dto.maxUsd ?? Infinity);
        if (usd > cap * 1.0001) {
          throw new BadRequestException(`$${usd.toFixed(2)} is over the per-trade cap of $${cap}`);
        }
        if (amount + config.feeReserveSol > solBalance) {
          throw new BadRequestException(
            `Not enough SOL: this needs ${amount.toFixed(4)} plus ${config.feeReserveSol} for fees, and the wallet has ${solBalance.toFixed(4)}`,
          );
        }
      }

      const unsigned = await this.pump.buildTradeTransaction({
        publicKey: wallet.address,
        action: dto.action,
        mint: dto.mint,
        amount: sellAll ? '100%' : amount,
        denominatedInSol: dto.action === 'buy',
        slippagePct: slippageBps / 100,
        priorityFeeSol: config.priorityFeeSol,
      });

      try {
        assertSafeTradeTransaction(unsigned, {
          wallet: wallet.address,
          action: dto.action,
          mint: dto.mint,
          solNotional: dto.action === 'buy' ? amount : quote.amountOut,
          slippageBps,
          extraPrograms: config.extraPrograms,
        });
      } catch (error) {
        if (error instanceof UnsafeTransactionError) {
          this.logger.error(`[${caller.tenant}] ${error.message} (wallet ${wallet.address}, mint ${dto.mint})`);
          throw new BadGatewayException(error.message);
        }
        throw error;
      }

      const signed = await this.privy.signTransaction(caller.tenant, wallet.id, unsigned);
      const { signature } = await this.solana.submitSignedTransaction(signed);
      this.logger.log(`[${caller.tenant}] ${dto.action} ${dto.mint} confirmed ${signature}`);

      return {
        signature,
        explorer: `https://solscan.io/tx/${signature}`,
        action: dto.action,
        mint: dto.mint,
        amountIn: amount,
        expectedOut: quote.amountOut,
        minAmountOut: quote.minAmountOut,
        valueUsd: quote.valueUsd,
      };
    });
  }

  /**
   * Send SOL or a token out to an address the user names. Custody without a
   * way out is a trap — and a token that graduates off the curve can only
   * leave this way, since blip will not quote it any more.
   */
  async withdraw(caller: CustodyCaller, dto: WithdrawDto) {
    if (!dto.all && !dto.amount) throw new BadRequestException('Give an amount, or all: true');
    const wallet = await this.privy.walletFor(caller.tenant, caller.userId);
    if (dto.to === wallet.address) throw new BadRequestException('That is this wallet');

    return this.exclusive(wallet.address, async () => {
      const owner = new PublicKey(wallet.address);
      const to = new PublicKey(dto.to);
      const solBalance = await this.solana.getSolBalance(wallet.address);
      const instructions: TransactionInstruction[] = [];
      let sent: string;

      if (!dto.mint) {
        const available = BigInt(Math.floor(solBalance * LAMPORTS_PER_SOL)) - BigInt(NETWORK_FEE_LAMPORTS);
        const lamports = dto.all ? available : toBaseUnits(dto.amount!, 9);
        if (lamports <= BigInt(0)) throw new BadRequestException('Nothing to withdraw after the network fee');
        if (lamports > available) {
          throw new BadRequestException(`The most you can withdraw is ${formatUnits(available, 9)} SOL after the network fee`);
        }
        instructions.push(SystemProgram.transfer({ fromPubkey: owner, toPubkey: to, lamports }));
        sent = `${formatUnits(lamports, 9)} SOL`;
      } else {
        const held = (await this.solana.getTokenAccounts(wallet.address)).find((a) => a.mint === dto.mint);
        if (!held) throw new BadRequestException('This wallet holds none of that token');
        const heldRaw = BigInt(held.rawAmount);
        const raw = dto.all ? heldRaw : toBaseUnits(dto.amount!, held.decimals);
        if (raw <= BigInt(0) || raw > heldRaw) {
          throw new BadRequestException(`Wallet holds ${formatUnits(heldRaw, held.decimals)} of that token`);
        }
        if (solBalance < MIN_SOL_FOR_TOKEN_OPS) {
          throw new BadRequestException(`A token withdrawal needs about ${MIN_SOL_FOR_TOKEN_OPS} SOL for fees and the recipient's token account`);
        }

        const programId = held.program === 'token-2022' ? TOKEN_2022_PROGRAM : TOKEN_PROGRAM;
        const mint = new PublicKey(dto.mint);
        const source = getAssociatedTokenAddressSync(mint, owner, false, programId);
        // allowOwnerOffCurve: the recipient may be a program-owned account (an exchange, a vault).
        const destination = getAssociatedTokenAddressSync(mint, to, true, programId);
        instructions.push(
          createAssociatedTokenAccountIdempotentInstruction(owner, destination, to, mint, programId),
          createTransferCheckedInstruction(source, mint, destination, owner, raw, held.decimals, [], programId),
        );
        sent = `${formatUnits(raw, held.decimals)} of ${dto.mint}`;
      }

      const { blockhash } = await this.solana.connection.getLatestBlockhash('confirmed');
      const message = new TransactionMessage({ payerKey: owner, recentBlockhash: blockhash, instructions }).compileToV0Message();
      const unsigned = Buffer.from(new VersionedTransaction(message).serialize()).toString('base64');

      const signed = await this.privy.signTransaction(caller.tenant, wallet.id, unsigned);
      const { signature } = await this.solana.submitSignedTransaction(signed);
      this.logger.log(`[${caller.tenant}] withdrew ${sent} from ${wallet.address} to ${dto.to}: ${signature}`);

      return { signature, explorer: `https://solscan.io/tx/${signature}`, to: dto.to, sent };
    });
  }

  private async exclusive<T>(walletAddress: string, job: () => Promise<T>): Promise<T> {
    if (this.busy.has(walletAddress)) {
      throw new ConflictException('Another transaction from this wallet is still confirming');
    }
    this.busy.add(walletAddress);
    try {
      return await job();
    } finally {
      this.busy.delete(walletAddress);
    }
  }
}
