import { Injectable, Logger } from '@nestjs/common';
import { UpstreamService } from '../common/upstream.service';
import { PricesService } from '../common/prices.service';

/** created_timestamp arrives in milliseconds; some legacy rows send seconds. */
function toMs(ts: unknown): number {
  const n = Number(ts) || 0;
  if (n === 0) return 0;
  return n < 1e12 ? n * 1000 : n;
}

/** pump.fun v3 sends `market_cap_usd`; older payloads used `usd_market_cap`. */
function marketCapUsd(token: { market_cap_usd?: number; usd_market_cap?: number }): number {
  return Number(token.market_cap_usd ?? token.usd_market_cap ?? 0) || 0;
}

export interface PumpFunToken {
  mint: string;
  name: string;
  symbol: string;
  description: string;
  image_uri?: string;
  metadata_uri?: string;
  twitter?: string;
  telegram?: string;
  bonding_curve: string;
  associated_bonding_curve: string;
  creator: string;
  /** Milliseconds since epoch (pump.fun v3). */
  created_timestamp: number;
  raydium_pool?: string;
  complete: boolean;
  virtual_sol_reserves: number;
  virtual_token_reserves: number;
  total_supply: number;
  website?: string;
  show_name: boolean;
  king_of_the_hill_timestamp?: number;
  market_cap: number;
  reply_count: number;
  last_reply: number;
  nsfw: boolean;
  market_id?: string;
  inverted?: boolean;
  is_currently_live: boolean;
  username?: string;
  profile_image?: string;
  /** pump.fun v3 spelling; `usd_market_cap` is the older one. */
  market_cap_usd?: number;
  usd_market_cap: number;
  volume_24h?: number;
  price_change_24h?: number;
  price?: number;
  last_trade_timestamp?: number;
}

export interface TokenTrade {
  signature: string;
  mint: string;
  sol_amount: number;
  token_amount: number;
  is_buy: boolean;
  user: string;
  timestamp: number;
  tx_index: number;
  username?: string;
  profile_image?: string;
}

export interface SearchResult {
  data: PumpFunToken[];
  suggestions?: string[];
  relatedTokens?: PumpFunToken[];
  searchType?: 'exact' | 'fuzzy' | 'partial' | 'ca' | 'ca_partial';
  totalMatches?: number;
}

export interface MarketStats {
  totalMarketCap: number;
  totalVolume24h: number;
  activeTokens: number;
  successfulGraduations: number;
  totalTokens?: number;
  last24Hours?: {
    newTokens?: number;
    volume?: number;
    trades?: number;
  };
}

@Injectable()
export class TokensService {
  private readonly logger = new Logger(TokensService.name);

  // Cache for tokens (for fallback search and performance)
  private tokenCache: Map<string, { tokens: PumpFunToken[], timestamp: number }> = new Map();
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  constructor(
    private readonly upstream: UpstreamService,
    private readonly prices: PricesService,
  ) {}

  /**
   * Call the pump.fun read API.
   *
   * Delegates to the shared UpstreamService instead of the old private host
   * list, which led with `frontend-api.pump.fun` — dead behind Cloudflare 1016 —
   * and burned a full timeout on every request before reaching a live mirror.
   * UpstreamService leads with v3 and remembers the last host that worked.
   */
  private async callFallbackAPI(endpoint: string, params: any = {}): Promise<any> {
    return this.upstream.get(endpoint, params);
  }

  /**
   * Calculate string similarity score (Levenshtein distance)
   */
  private calculateSimilarity(str1: string, str2: string): number {
    const s1 = str1.toLowerCase();
    const s2 = str2.toLowerCase();
    
    // Exact match
    if (s1 === s2) return 1;
    
    // Contains match
    if (s1.includes(s2) || s2.includes(s1)) return 0.8;
    
    // Levenshtein distance for fuzzy matching
    const matrix: number[][] = [];
    
    for (let i = 0; i <= s2.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= s1.length; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= s2.length; i++) {
      for (let j = 1; j <= s1.length; j++) {
        if (s2.charAt(i - 1) === s1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    
    const maxLength = Math.max(s1.length, s2.length);
    const distance = matrix[s2.length][s1.length];
    return 1 - distance / maxLength;
  }

  /**
   * Update token cache
   */
  private updateTokenCache(key: string, tokens: PumpFunToken[]) {
    const cacheSize = tokens.length;
    this.tokenCache.set(key, {
      tokens,
      timestamp: Date.now()
    });
    this.logger.debug(`📦 Updated cache "${key}" with ${cacheSize} tokens`);
  }

  /**
   * Search cached tokens
   */
  private searchCachedTokens(query: string, limit: number): PumpFunToken[] {
    const searchTerm = query.toLowerCase();
    let allCachedTokens: PumpFunToken[] = [];
    let validCaches = 0;
    let expiredCaches = 0;
    
    // Collect all cached tokens
    for (const [key, cache] of this.tokenCache.entries()) {
      // Check if cache is still valid
      if (Date.now() - cache.timestamp < this.CACHE_DURATION) {
        allCachedTokens = allCachedTokens.concat(cache.tokens);
        validCaches++;
      } else {
        // Remove expired cache
        this.tokenCache.delete(key);
        expiredCaches++;
      }
    }
    
    this.logger.debug(`📦 Cache status: ${validCaches} valid, ${expiredCaches} expired, ${allCachedTokens.length} total tokens`);
    
    // Remove duplicates
    const uniqueTokens = Array.from(
      new Map(allCachedTokens.map(token => [token.mint, token])).values()
    );
    
    // Filter based on search query
    const filteredTokens = uniqueTokens.filter(token => {
      const nameMatch = token.name?.toLowerCase().includes(searchTerm);
      const symbolMatch = token.symbol?.toLowerCase().includes(searchTerm);
      const descriptionMatch = token.description?.toLowerCase().includes(searchTerm);
      
      return nameMatch || symbolMatch || descriptionMatch;
    });
    
    this.logger.debug(`📦 Cache search: Found ${filteredTokens.length} matches for "${query}"`);
    
    return filteredTokens.slice(0, limit);
  }

  /**
   * Get featured tokens (King of the Hill)
   */
  async getFeaturedTokens(limit = 20, offset = 0): Promise<{ data: PumpFunToken[] }> {
    try {
      this.logger.log(`Fetching featured tokens - limit: ${limit}, offset: ${offset}`);
      
      // Try to get King of the Hill tokens (featured)
      try {
        const data = await this.callFallbackAPI('/coins/king-of-the-hill', {
          offset,
          limit,
          includeNsfw: false,
        });
        
        this.logger.log(`Fetched ${data.length} featured tokens`);
        this.updateTokenCache('featured', data);
        return { data };
      } catch (error) {
        // Fallback to trending as featured
        this.logger.warn('Featured endpoint failed, using trending as fallback');
        return this.getTrendingTokens(limit, offset);
      }
    } catch (error) {
      this.logger.error('All featured token APIs failed:', error.message);
      // Try cache
      const cached = this.searchCachedTokens('', limit);
      return { data: cached };
    }
  }

  /**
   * Get trending tokens
   */
  async getTrendingTokens(limit = 50, offset = 0): Promise<{ data: PumpFunToken[] }> {
    try {
      this.logger.log(`Fetching trending tokens - limit: ${limit}, offset: ${offset}`);
      
      const data = await this.callFallbackAPI('/coins', {
        offset,
        limit,
        sort: 'market_cap',
        order: 'DESC',
        includeNsfw: false,
      });
      
      // Cache the tokens for search fallback
      this.updateTokenCache('trending', data);
      
      this.logger.log(`Fetched ${data.length} trending tokens`);
      return { data };
    } catch (error) {
      this.logger.error('All trending token APIs failed:', error.message);
      // Try cache
      const cached = this.searchCachedTokens('', limit);
      return { data: cached };
    }
  }

  /**
   * Get new tokens
   */
  async getNewTokens(limit = 50, offset = 0): Promise<{ data: PumpFunToken[] }> {
    try {
      this.logger.log(`Fetching new tokens - limit: ${limit}, offset: ${offset}`);
      
      const data = await this.callFallbackAPI('/coins', {
        offset,
        limit,
        sort: 'created_timestamp',
        order: 'DESC',
        includeNsfw: false,
      });
      
      // Cache the tokens for search fallback
      this.updateTokenCache('new', data);
      
      this.logger.log(`Fetched ${data.length} new tokens`);
      return { data };
    } catch (error) {
      this.logger.error('All new token APIs failed:', error.message);
      // Try cache
      const cached = this.searchCachedTokens('', limit);
      return { data: cached };
    }
  }

  /**
   * Enhanced search with suggestions and related tokens
   */
  async searchTokensAdvanced(query: string, limit = 20): Promise<SearchResult> {
    try {
      this.logger.log(`🔍 ============ ADVANCED SEARCH START ============`);
      this.logger.log(`Query: "${query}" | Limit: ${limit}`);
      
      if (!query || query.trim().length === 0) {
        return { 
          data: [],
          searchType: 'exact',
          totalMatches: 0
        };
      }

      const searchTerm = query.trim().toLowerCase();
      const results: SearchResult = {
        data: [],
        suggestions: [],
        relatedTokens: [],
        searchType: 'exact',
        totalMatches: 0
      };

      // ========== 1. CHECK IF IT'S A CONTRACT ADDRESS ==========
      // CA can be full address or partial (first/last 8 chars)
      const looksLikeCa = /^[a-zA-Z0-9]{32,44}$/.test(searchTerm) || 
                          (/^[a-zA-Z0-9]{6,}$/.test(searchTerm) && searchTerm.length > 10);
      
      if (looksLikeCa) {
        this.logger.log(`🔑 Detected possible Contract Address: ${searchTerm}`);
        results.searchType = 'ca';
        
        // Try exact match first
        if (searchTerm.length >= 32) {
          try {
            const tokenResult = await this.getTokenDetails(searchTerm);
            if (tokenResult.data) {
              this.logger.log(`✅ Found token by exact CA match`);
              results.data = [tokenResult.data];
              results.totalMatches = 1;
              return results;
            }
          } catch (err) {
            this.logger.debug(`No exact CA match for ${searchTerm}`);
          }
        }
        
        // For partial CA, we'll search in the fetched tokens below
        this.logger.log(`📝 Will search for partial CA match: ${searchTerm}`);
      }

      // ========== 2. TRY DIRECT API SEARCH ==========
      try {
        this.logger.log(`[Method 1] Attempting direct API search for: "${query}"`);
        
        const searchEndpoints = [
          '/coins/search',
          '/search',
          '/tokens/search'
        ];

        for (const endpoint of searchEndpoints) {
          try {
            const data = await this.callFallbackAPI(endpoint, {
              q: query,
              query: query,
              search: query,
              limit,
              includeNsfw: false,
            });
            
            if (data && data.length > 0) {
              this.logger.log(`✅ Found ${data.length} tokens via ${endpoint}`);
              results.data = data.slice(0, limit);
              results.totalMatches = data.length;
              results.searchType = 'exact';
              return results;
            }
          } catch (endpointError) {
            this.logger.debug(`Search endpoint ${endpoint} failed:`, endpointError.message);
          }
        }
      } catch (apiError) {
        this.logger.warn(`Direct API search failed for "${query}":`, apiError.message);
      }

      // ========== 3. FETCH TOKEN DATA FOR LOCAL SEARCH ==========
      this.logger.log(`📊 Using fetch-and-filter search for: "${query}"`);
      
      // Fetch multiple pages to get more tokens
      const fetchPromises = [];
      
      // Fetch by market cap (3 pages)
      for (let page = 0; page < 3; page++) {
        fetchPromises.push(
          this.callFallbackAPI('/coins', { 
            limit: 200, 
            offset: page * 200,
            includeNsfw: false,
            sort: 'market_cap',
            order: 'DESC'
          }).catch(err => {
            this.logger.debug(`Page ${page} (market_cap) failed: ${err.message}`);
            return [];
          })
        );
      }
      
      // Also fetch newest tokens
      fetchPromises.push(
        this.callFallbackAPI('/coins', { 
          limit: 100, 
          offset: 0,
          includeNsfw: false,
          sort: 'created_timestamp',
          order: 'DESC'
        }).catch(err => {
          this.logger.debug(`New tokens fetch failed: ${err.message}`);
          return [];
        })
      );

      this.logger.log(`Fetching ${fetchPromises.length} pages of tokens...`);
      const fetchResults = await Promise.allSettled(fetchPromises);
      
      let allTokens: PumpFunToken[] = [];
      
      // Collect all successful results
      for (const result of fetchResults) {
        if (result.status === 'fulfilled' && result.value) {
          allTokens = allTokens.concat(result.value);
        }
      }

      // Deduplicate
      const uniqueTokens = Array.from(
        new Map(allTokens.map(token => [token.mint, token])).values()
      );
      
      this.logger.log(`✅ Fetched ${uniqueTokens.length} unique tokens from API`);

      // ========== 4. PERFORM SEARCH ==========
      const exactMatches: PumpFunToken[] = [];
      const fuzzyMatches: PumpFunToken[] = [];
      const partialMatches: PumpFunToken[] = [];
      const relatedTokens: PumpFunToken[] = [];

      // Track all search scores
      const tokenScores = new Map<string, { token: PumpFunToken, score: number, matchType: string }>();

      for (const token of uniqueTokens) {
        let bestScore = 0;
        let matchType = 'none';
        
        // Check CA match (for partial CA searches)
        if (looksLikeCa) {
          const mintLower = token.mint.toLowerCase();
          if (mintLower === searchTerm) {
            bestScore = 1.2; // Highest priority for exact CA
            matchType = 'ca_exact';
          } else if (mintLower.startsWith(searchTerm) || mintLower.endsWith(searchTerm)) {
            bestScore = 0.95;
            matchType = 'ca_partial';
          } else if (mintLower.includes(searchTerm)) {
            bestScore = 0.9;
            matchType = 'ca_contains';
          }
        }
        
        // Name matching
        const nameLower = token.name?.toLowerCase() || '';
        const nameScore = this.calculateSimilarity(nameLower, searchTerm);
        
        if (nameLower === searchTerm) {
          bestScore = Math.max(bestScore, 1);
          matchType = bestScore === 1 ? 'exact_name' : matchType;
        } else if (nameLower.includes(searchTerm)) {
          bestScore = Math.max(bestScore, 0.8);
          matchType = matchType === 'none' ? 'partial_name' : matchType;
        } else if (nameScore > 0.7) {
          bestScore = Math.max(bestScore, nameScore * 0.9);
          matchType = matchType === 'none' ? 'fuzzy_name' : matchType;
        }
        
        // Symbol matching (higher weight for symbol matches)
        const symbolLower = token.symbol?.toLowerCase() || '';
        const symbolScore = this.calculateSimilarity(symbolLower, searchTerm);
        
        if (symbolLower === searchTerm) {
          bestScore = Math.max(bestScore, 1.1); // Slightly higher than name match
          matchType = bestScore === 1.1 ? 'exact_symbol' : matchType;
        } else if (symbolLower.includes(searchTerm)) {
          bestScore = Math.max(bestScore, 0.85);
          matchType = matchType === 'none' ? 'partial_symbol' : matchType;
        } else if (symbolScore > 0.7) {
          bestScore = Math.max(bestScore, symbolScore * 0.95);
          matchType = matchType === 'none' ? 'fuzzy_symbol' : matchType;
        }
        
        // Description matching (lower weight)
        const descLower = token.description?.toLowerCase() || '';
        if (descLower.includes(searchTerm)) {
          bestScore = Math.max(bestScore, 0.6);
          matchType = matchType === 'none' ? 'description' : matchType;
        }
        
        // Multi-word search
        const searchWords = searchTerm.split(/\s+/);
        if (searchWords.length > 1) {
          const allWordsMatch = searchWords.every(word => 
            nameLower.includes(word) || symbolLower.includes(word) || descLower.includes(word)
          );
          if (allWordsMatch) {
            bestScore = Math.max(bestScore, 0.75);
            matchType = matchType === 'none' ? 'multi_word' : matchType;
          }
        }
        
        // Store token with its score
        if (bestScore > 0.5) {
          tokenScores.set(token.mint, { token, score: bestScore, matchType });
          
          // Categorize matches
          if (bestScore >= 1) {
            exactMatches.push(token);
          } else if (bestScore >= 0.8) {
            fuzzyMatches.push(token);
          } else if (bestScore >= 0.6) {
            partialMatches.push(token);
          } else {
            relatedTokens.push(token);
          }
        }
      }

      // ========== 5. COMPILE RESULTS ==========
      // Sort each category by market cap
      const sortByMarketCap = (a: PumpFunToken, b: PumpFunToken) =>
        marketCapUsd(b) - marketCapUsd(a);
      
      exactMatches.sort(sortByMarketCap);
      fuzzyMatches.sort(sortByMarketCap);
      partialMatches.sort(sortByMarketCap);
      relatedTokens.sort(sortByMarketCap);
      
      // Combine results (exact > fuzzy > partial)
      results.data = [
        ...exactMatches.slice(0, Math.min(10, limit)),
        ...fuzzyMatches.slice(0, Math.min(5, limit - exactMatches.length)),
        ...partialMatches.slice(0, Math.max(0, limit - exactMatches.length - fuzzyMatches.length))
      ];
      
      results.totalMatches = exactMatches.length + fuzzyMatches.length + partialMatches.length;
      results.relatedTokens = relatedTokens.slice(0, 5);
      
      // Determine search type
      if (exactMatches.length > 0) {
        results.searchType = 'exact';
      } else if (fuzzyMatches.length > 0) {
        results.searchType = 'fuzzy';
      } else if (partialMatches.length > 0) {
        results.searchType = 'partial';
      }

      // ========== 6. GENERATE SUGGESTIONS ==========
      if (results.data.length === 0) {
        // No matches found - generate suggestions
        const suggestions = new Set<string>();
        
        // Find tokens with similar starting letters
        const firstChar = searchTerm.charAt(0);
        const similarTokens = uniqueTokens.filter(token => 
          token.name?.toLowerCase().startsWith(firstChar) ||
          token.symbol?.toLowerCase().startsWith(firstChar)
        ).slice(0, 20);
        
        similarTokens.forEach(token => {
          if (token.name && suggestions.size < 10) {
            suggestions.add(token.name);
          }
          if (token.symbol && suggestions.size < 10) {
            suggestions.add(token.symbol);
          }
        });
        
        results.suggestions = Array.from(suggestions);
        
        this.logger.log(`💡 No exact matches. Generated ${results.suggestions.length} suggestions`);
      } else {
        // Found matches - suggest related searches
        const suggestions = new Set<string>();
        
        // Add symbols of top matches as suggestions
        results.data.slice(0, 5).forEach(token => {
          if (token.symbol && token.symbol.toLowerCase() !== searchTerm) {
            suggestions.add(token.symbol);
          }
        });
        
        // Add related token names
        relatedTokens.slice(0, 5).forEach(token => {
          if (token.name && suggestions.size < 8) {
            suggestions.add(token.name);
          }
        });
        
        results.suggestions = Array.from(suggestions);
      }

      // ========== 7. LOG RESULTS ==========
      this.logger.log(`📊 Search Results Summary:`);
      this.logger.log(`  Query: "${query}"`);
      this.logger.log(`  Search Type: ${results.searchType}`);
      this.logger.log(`  Exact Matches: ${exactMatches.length}`);
      this.logger.log(`  Fuzzy Matches: ${fuzzyMatches.length}`);
      this.logger.log(`  Partial Matches: ${partialMatches.length}`);
      this.logger.log(`  Related Tokens: ${relatedTokens.length}`);
      this.logger.log(`  Total Results: ${results.data.length}`);
      
      if (results.data.length > 0) {
        this.logger.log(`  Top Results:`);
        results.data.slice(0, 3).forEach((token, i) => {
          const scoreInfo = tokenScores.get(token.mint);
          this.logger.log(`    ${i + 1}. ${token.name} (${token.symbol})`);
          this.logger.log(`       Match: ${scoreInfo?.matchType} | Score: ${scoreInfo?.score?.toFixed(2)}`);
        });
      }
      
      this.logger.log(`🔍 ============ ADVANCED SEARCH END ============`);
      
      return results;

    } catch (error) {
      this.logger.error(`❌ Advanced search failed for "${query}":`, error.message);
      
      // Last resort: Use cached tokens if available
      const cachedResults = this.searchCachedTokens(query, limit);
      
      return {
        data: cachedResults,
        searchType: 'fuzzy',
        totalMatches: cachedResults.length,
        suggestions: []
      };
    }
  }

  /**
   * Standard search - wrapper for advanced search
   */
  async searchTokens(query: string, limit = 20): Promise<{ data: PumpFunToken[] }> {
    const advancedResults = await this.searchTokensAdvanced(query, limit);
    return { data: advancedResults.data };
  }

  /**
   * Get token details by mint address
   */
  async getTokenDetails(mint: string): Promise<{ data: PumpFunToken | null }> {
    try {
      this.logger.log(`Fetching token details for mint: ${mint}`);
      
      const data = await this.callFallbackAPI(`/coins/${mint}`, {});
      this.logger.log(`Fetched token details: ${data?.name || 'Unknown'}`);
      return { data };
    } catch (error) {
      this.logger.error(`Failed to fetch token details for ${mint}:`, error.message);
      return { data: null };
    }
  }

  /**
   * Get token trades
   */
  async getTokenTrades(mint: string, limit = 50, offset = 0): Promise<{ data: TokenTrade[] }> {
    try {
      this.logger.log(`Fetching trades for token: ${mint} - limit: ${limit}, offset: ${offset}`);
      
      const data = await this.callFallbackAPI(`/trades/all/${mint}`, {
        offset,
        limit,
      });
      
      this.logger.log(`Fetched ${data.length} trades for token: ${mint}`);
      return { data };
    } catch (error) {
      this.logger.warn(`No trades found for token ${mint}`);
      return { data: [] };
    }
  }

  /**
   * Get latest trades across all tokens
   */
  async getLatestTrades(limit = 100): Promise<{ data: TokenTrade[] }> {
    try {
      this.logger.log(`Fetching latest trades - limit: ${limit}`);
      
      const data = await this.callFallbackAPI('/trades/latest', { limit });
      this.logger.log(`Fetched ${data.length} latest trades`);
      return { data };
    } catch (error) {
      this.logger.warn('No latest trades available');
      return { data: [] };
    }
  }

  /**
   * Get SOL price.
   *
   * Reads the shared PricesService, which races several feeds and takes their
   * median in the background. It never invents a number: when every source is
   * down it reports 0, not a hardcoded $100 that silently turns every dollar
   * figure in the product into a plausible lie.
   */
  async getSolPrice(): Promise<{ data: { price: number } }> {
    const { price } = this.prices.getSolUsd();
    return { data: { price } };
  }

  /**
   * Get market statistics
   */
  async getMarketStats(): Promise<{ data: MarketStats }> {
    try {
      this.logger.log('Calculating market stats from real token data');
      
      // Get trending tokens to calculate stats
      const trendingResult = await this.getTrendingTokens(100);
      const tokens = trendingResult.data;
      
      if (tokens.length === 0) {
        this.logger.warn('No tokens available for stats calculation');
        return {
          data: {
            totalMarketCap: 0,
            totalVolume24h: 0,
            activeTokens: 0,
            successfulGraduations: 0,
            totalTokens: 0,
          }
        };
      }
      
      const totalMarketCap = tokens.reduce((sum, token) => sum + marketCapUsd(token), 0);
      const activeTokens = tokens.filter(token => token.is_currently_live).length;
      const successfulGraduations = tokens.filter(token => token.complete).length;
      const totalVolume24h = tokens.reduce((sum, token) => sum + (token.volume_24h || 0), 0);

      // Count new tokens in the last 24 hours. created_timestamp is in
      // milliseconds; comparing it against a seconds-based cutoff (as the old
      // code did) counted every token as created in the last day.
      const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
      const newTokensLast24h = tokens.filter(token =>
        toMs(token.created_timestamp) > oneDayAgo
      ).length;
      
      const stats: MarketStats = {
        totalMarketCap,
        totalVolume24h,
        activeTokens,
        successfulGraduations,
        totalTokens: tokens.length,
        last24Hours: {
          newTokens: newTokensLast24h,
          volume: totalVolume24h,
          trades: 0 // Would need trades endpoint to calculate
        }
      };
      
      this.logger.log(`Market stats calculated: ${JSON.stringify(stats)}`);
      return { data: stats };
    } catch (error) {
      this.logger.error('Failed to calculate market stats:', error.message);
      return {
        data: {
          totalMarketCap: 0,
          totalVolume24h: 0,
          activeTokens: 0,
          successfulGraduations: 0,
          totalTokens: 0,
        }
      };
    }
  }
}