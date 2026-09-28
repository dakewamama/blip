import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import axios, { AxiosRequestConfig } from 'axios';
import { DEFAULT_PUMP_API_BASES } from './config';

/**
 * Talks to the pump.fun read API across its mirrors.
 *
 * The original code tried a hardcoded primary that has been dead (Cloudflare 1016)
 * and burned an 8s timeout on every request before reaching a working mirror.
 * This version remembers which host last worked and tries that first.
 */
@Injectable()
export class UpstreamService {
  private readonly logger = new Logger(UpstreamService.name);
  private readonly bases: string[];
  private preferred: string;

  constructor() {
    this.bases = process.env.PUMP_API_BASES
      ? process.env.PUMP_API_BASES.split(',').map((s) => s.trim())
      : [...DEFAULT_PUMP_API_BASES];
    this.preferred = this.bases[0];
  }

  private order(): string[] {
    return [this.preferred, ...this.bases.filter((b) => b !== this.preferred)];
  }

  async get<T = any>(path: string, params: Record<string, unknown> = {}, timeout = 8000): Promise<T> {
    const errors: string[] = [];

    for (const base of this.order()) {
      try {
        const config: AxiosRequestConfig = {
          params,
          timeout,
          headers: { Accept: 'application/json' },
          // Treat only 2xx as success so a Cloudflare error page never
          // gets parsed as a token list.
          validateStatus: (s) => s >= 200 && s < 300,
        };
        const response = await axios.get<T>(`${base}${path}`, config);

        if (base !== this.preferred) {
          this.logger.log(`Upstream preference moved to ${base}`);
          this.preferred = base;
        }
        return response.data;
      } catch (error: any) {
        const detail = error?.response?.status ? `HTTP ${error.response.status}` : error?.message;
        errors.push(`${base}: ${detail}`);
      }
    }

    this.logger.error(`All pump.fun mirrors failed for ${path} — ${errors.join(' | ')}`);
    throw new ServiceUnavailableException({
      message: 'pump.fun read API is unreachable',
      attempts: errors,
    });
  }

  get activeHost(): string {
    return this.preferred;
  }
}
