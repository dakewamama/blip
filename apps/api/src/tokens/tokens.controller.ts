import { Controller, Get, Query, Param, Logger } from '@nestjs/common';
import { TokensService } from './tokens.service';

@Controller('tokens')
export class TokensController {
  private readonly logger = new Logger(TokensController.name);

  constructor(private readonly tokensService: TokensService) {}

  /**
   * Health check endpoint
   */
  @Get('health')
  async getServiceHealth() {
    try {
      // Test the service by fetching a small number of tokens
      const result = await this.tokensService.getTrendingTokens(1, 0);
      
      return {
        status: 'ok',
        timestamp: new Date().toISOString(),
        service: 'tokens-service',
        externalApi: {
          pumpFun: result.data.length > 0 ? 'connected' : 'limited',
          dataCount: result.data.length
        }
      };
    } catch (error) {
      this.logger.error('Tokens service health check failed:', error);
      return {
        status: 'error',
        timestamp: new Date().toISOString(),
        service: 'tokens-service',
        error: error.message
      };
    }
  }

  /**
   * Get featured tokens (King of the Hill)
   */
  @Get('featured')
  async getFeaturedTokens(
    @Query('limit') limit = 20,
    @Query('offset') offset = 0,
  ) {
    try {
      this.logger.log(`Fetching featured tokens - limit: ${limit}, offset: ${offset}`);
      
      const result = await this.tokensService.getFeaturedTokens(Number(limit), Number(offset));
      
      this.logger.log(`Returned ${result.data.length} featured tokens`);
      
      return {
        success: true,
        data: result.data,
        pagination: {
          limit: Number(limit),
          offset: Number(offset),
          total: result.data.length,
        },
      };
    } catch (error) {
      this.logger.error('Failed to fetch featured tokens:', error);
      return {
        success: false,
        error: error.message || 'Failed to fetch featured tokens',
        data: [],
      };
    }
  }

  /**
   * Get trending tokens
   */
  @Get('trending')
  async getTrendingTokens(
    @Query('limit') limit = 50,
    @Query('offset') offset = 0,
  ) {
    try {
      this.logger.log(`Fetching trending tokens - limit: ${limit}, offset: ${offset}`);
      
      const result = await this.tokensService.getTrendingTokens(Number(limit), Number(offset));
      
      this.logger.log(`Returned ${result.data.length} trending tokens`);
      
      return {
        success: true,
        data: result.data,
        pagination: {
          limit: Number(limit),
          offset: Number(offset),
          total: result.data.length,
        },
      };
    } catch (error) {
      this.logger.error('Failed to fetch trending tokens:', error);
      return {
        success: false,
        error: error.message || 'Failed to fetch trending tokens',
        data: [],
      };
    }
  }

  /**
   * Get new tokens
   */
  @Get('new')
  async getNewTokens(
    @Query('limit') limit = 50,
    @Query('offset') offset = 0,
  ) {
    try {
      this.logger.log(`Fetching new tokens - limit: ${limit}, offset: ${offset}`);
      
      const result = await this.tokensService.getNewTokens(Number(limit), Number(offset));
      
      this.logger.log(`Returned ${result.data.length} new tokens`);
      
      return {
        success: true,
        data: result.data,
        pagination: {
          limit: Number(limit),
          offset: Number(offset),
          total: result.data.length,
        },
      };
    } catch (error) {
      this.logger.error('Failed to fetch new tokens:', error);
      return {
        success: false,
        error: error.message || 'Failed to fetch new tokens',
        data: [],
      };
    }
  }

  /**
   * Advanced search endpoint with suggestions and related tokens
   */
  @Get('search/advanced')
  async searchTokensAdvanced(
    @Query('q') query: string,
    @Query('limit') limit = 20
  ) {
    try {
      if (!query || query.trim().length === 0) {
        return {
          success: false,
          error: 'Query parameter is required',
          data: [],
          suggestions: [],
          relatedTokens: [],
          searchInfo: {
            supportedSearchTypes: [
              'Contract Address (full or partial)',
              'Token Name',
              'Token Symbol',
              'Description',
              'Fuzzy Matching (handles typos)',
              'Multi-word Search'
            ],
            examples: [
              'Full CA: "HeLLonEArth5cPN3wQMVYLhgMBR1Wny7t5ggp5pump"',
              'Partial CA: "HeLLon" or "p5pump"',
              'Token Name: "Doge"',
              'Token Symbol: "PEPE"',
              'Multiple words: "moon coin"'
            ]
          }
        };
      }

      this.logger.log(`🔍 Advanced search request: "${query}" - limit: ${limit}`);
      
      const result = await this.tokensService.searchTokensAdvanced(query.trim(), Number(limit));
      
      this.logger.log(`✅ Advanced search completed: ${result.data.length} results, ${result.suggestions?.length || 0} suggestions`);
      
      return {
        success: true,
        query: query.trim(),
        searchType: result.searchType,
        data: result.data,
        totalMatches: result.totalMatches,
        suggestions: result.suggestions || [],
        relatedTokens: result.relatedTokens || [],
        metadata: {
          limit: Number(limit),
          timestamp: new Date().toISOString(),
          searchCapabilities: {
            contractAddress: true,
            tokenName: true,
            tokenSymbol: true,
            description: true,
            fuzzyMatching: true,
            partialMatching: true,
            suggestions: true
          }
        }
      };
    } catch (error) {
      this.logger.error('Advanced search failed:', error);
      return {
        success: false,
        error: error.message || 'Failed to perform advanced search',
        data: [],
        suggestions: [],
        relatedTokens: []
      };
    }
  }

  /**
   * Standard search endpoint (uses advanced search internally)
   */
  @Get('search')
  async searchTokens(@Query('q') query: string, @Query('limit') limit = 20) {
    try {
      if (!query || query.trim().length === 0) {
        return {
          success: false,
          error: 'Query parameter is required',
          data: [],
          searchInfo: {
            supportedSearchTypes: [
              'Contract Address (full or partial)',
              'Token Name',
              'Token Symbol',
              'Description',
              'Fuzzy Matching (handles typos)',
              'Multi-word Search'
            ],
            examples: [
              'Full CA: "HeLLonEArth5cPN3wQMVYLhgMBR1Wny7t5ggp5pump"',
              'Partial CA: "HeLLon" or "p5pump"',
              'Token Name: "Doge"',
              'Token Symbol: "PEPE"',
              'Multiple words: "moon coin"'
            ]
          }
        };
      }

      this.logger.log(`Searching tokens with query: "${query}" - limit: ${limit}`);
      
      // Use the advanced search
      const result = await this.tokensService.searchTokensAdvanced(query.trim(), Number(limit));
      
      this.logger.log(`Found ${result.data.length} tokens for query: "${query}"`);
      
      return {
        success: true,
        data: result.data,
        query: query.trim(),
        searchType: result.searchType,
        totalMatches: result.totalMatches || result.data.length,
        suggestions: result.suggestions || [],
        pagination: {
          limit: Number(limit),
          total: result.data.length,
        },
      };
    } catch (error) {
      this.logger.error('Failed to search tokens:', error);
      return {
        success: false,
        error: error.message || 'Failed to search tokens',
        data: [],
      };
    }
  }

  /**
   * Get token details by mint address
   */
  @Get(':mint')
  async getTokenByMint(@Param('mint') mint: string) {
    try {
      if (!mint || mint.trim().length === 0) {
        return {
          success: false,
          error: 'Mint address is required',
          data: null,
        };
      }

      this.logger.log(`Fetching token details for mint: ${mint}`);
      
      const result = await this.tokensService.getTokenDetails(mint.trim());
      
      if (result.data) {
        this.logger.log(`Found token: ${result.data.name || 'Unknown'}`);
        return {
          success: true,
          data: result.data,
        };
      } else {
        this.logger.log(`Token not found for mint: ${mint}`);
        return {
          success: false,
          error: 'Token not found',
          data: null,
        };
      }
    } catch (error) {
      this.logger.error(`Failed to fetch token ${mint}:`, error);
      return {
        success: false,
        error: error.message || 'Failed to fetch token details',
        data: null,
      };
    }
  }

  /**
   * Get trades for a specific token
   */
  @Get(':mint/trades')
  async getTokenTrades(
    @Param('mint') mint: string,
    @Query('limit') limit = 50,
    @Query('offset') offset = 0,
  ) {
    try {
      if (!mint || mint.trim().length === 0) {
        return {
          success: false,
          error: 'Mint address is required',
          data: [],
        };
      }

      this.logger.log(`Fetching trades for token: ${mint} - limit: ${limit}, offset: ${offset}`);
      
      const result = await this.tokensService.getTokenTrades(mint.trim(), Number(limit), Number(offset));
      
      this.logger.log(`Found ${result.data.length} trades for token: ${mint}`);
      
      return {
        success: true,
        data: result.data,
        mint: mint.trim(),
        pagination: {
          limit: Number(limit),
          offset: Number(offset),
          total: result.data.length,
        },
      };
    } catch (error) {
      this.logger.error(`Failed to fetch trades for token ${mint}:`, error);
      return {
        success: false,
        error: error.message || 'Failed to fetch token trades',
        data: [],
      };
    }
  }

  /**
   * Get latest trades across all tokens
   */
  @Get('trades/latest')
  async getLatestTrades(@Query('limit') limit = 100) {
    try {
      this.logger.log(`Fetching latest trades - limit: ${limit}`);
      
      const result = await this.tokensService.getLatestTrades(Number(limit));
      
      this.logger.log(`Found ${result.data.length} latest trades`);
      
      return {
        success: true,
        data: result.data,
        pagination: {
          limit: Number(limit),
          total: result.data.length,
        },
      };
    } catch (error) {
      this.logger.error('Failed to fetch latest trades:', error);
      return {
        success: false,
        error: error.message || 'Failed to fetch latest trades',
        data: [],
      };
    }
  }

  /**
   * Get market statistics
   */
  @Get('stats/market')
  async getMarketStats() {
    try {
      this.logger.log('Fetching market statistics');
      
      const result = await this.tokensService.getMarketStats();
      
      this.logger.log('Market stats calculated successfully');
      
      return {
        success: true,
        data: result.data,
      };
    } catch (error) {
      this.logger.error('Failed to fetch market stats:', error);
      return {
        success: false,
        error: error.message || 'Failed to fetch market stats',
        data: {
          totalMarketCap: 0,
          totalVolume24h: 0,
          activeTokens: 0,
          successfulGraduations: 0,
          totalTokens: 0,
        },
      };
    }
  }

  /**
   * Get SOL price
   */
  @Get('price/sol')
  async getSolPrice() {
    try {
      this.logger.log('Fetching SOL price');
      
      const result = await this.tokensService.getSolPrice();
      
      this.logger.log(`SOL price: $${result.data.price}`);
      
      return {
        success: true,
        data: result.data,
      };
    } catch (error) {
      this.logger.error('Failed to fetch SOL price:', error);
      return {
        success: false,
        error: error.message || 'Failed to fetch SOL price',
        data: { price: 0 },
      };
    }
  }

  /**
   * Dashboard analytics endpoint
   */
  @Get('analytics/dashboard')
  async getDashboardData() {
    try {
      this.logger.log('Fetching dashboard analytics data');
      
      // Fetch multiple data sources concurrently
      const [featuredResult, trendingResult, newResult, marketStats] = await Promise.all([
        this.tokensService.getFeaturedTokens(10),
        this.tokensService.getTrendingTokens(20),
        this.tokensService.getNewTokens(20),
        this.tokensService.getMarketStats(),
      ]);

      const totalFeatured = featuredResult.data.length;
      const totalTrending = trendingResult.data.length;
      const totalNew = newResult.data.length;
      
      // Combine unique tokens
      const allTokens = [...featuredResult.data, ...trendingResult.data];
      const uniqueTokens = allTokens.filter((token, index, arr) => 
        arr.findIndex(t => t.mint === token.mint) === index
      );

      const analytics = {
        featuredTokens: featuredResult.data,
        trendingTokens: trendingResult.data,
        newTokens: newResult.data,
        marketStats: marketStats.data,
        summary: {
          totalFeatured,
          totalTrending,
          totalNew,
          totalUnique: uniqueTokens.length,
        },
      };

      this.logger.log(`Dashboard data prepared: ${totalFeatured} featured, ${totalTrending} trending, ${totalNew} new`);
      
      return {
        success: true,
        data: analytics,
      };
    } catch (error) {
      this.logger.error('Failed to fetch dashboard data:', error);
      return {
        success: false,
        error: error.message || 'Failed to fetch dashboard data',
        data: {
          featuredTokens: [],
          trendingTokens: [],
          newTokens: [],
          marketStats: null,
          summary: {
            totalFeatured: 0,
            totalTrending: 0,
            totalNew: 0,
            totalUnique: 0,
          },
        },
      };
    }
  }

  /**
   * Debug endpoint - Search test
   */
  @Get('debug/search-test')
  async testSearch(@Query('q') query: string = 'test') {
    try {
      this.logger.log(`========== SEARCH DIAGNOSTIC ==========`);
      this.logger.log(`Testing search for: "${query}"`);
      
      // First, fetch some tokens to see what's available
      const sampleTokens = await this.tokensService.getTrendingTokens(50, 0);
      
      // Get unique first letters of token names
      const firstLetters = new Set(
        sampleTokens.data
          .map(t => t.name?.charAt(0)?.toUpperCase())
          .filter(Boolean)
      );
      
      // Get tokens that might match the query
      const searchTerm = query.toLowerCase();
      const potentialMatches = sampleTokens.data.filter(token => {
        const name = token.name?.toLowerCase() || '';
        const symbol = token.symbol?.toLowerCase() || '';
        const firstLetter = searchTerm.charAt(0);
        
        return name.startsWith(firstLetter) || symbol.startsWith(firstLetter);
      });
      
      // Perform actual search
      const searchResults = await this.tokensService.searchTokensAdvanced(query, 20);
      
      const diagnostic = {
        query,
        timestamp: new Date().toISOString(),
        results: {
          found: searchResults.data.length,
          searchType: searchResults.searchType,
          totalMatches: searchResults.totalMatches,
          tokens: searchResults.data.slice(0, 5).map(t => ({
            name: t.name,
            symbol: t.symbol,
            mint: t.mint.slice(0, 8) + '...'
          }))
        },
        suggestions: searchResults.suggestions || [],
        relatedTokens: searchResults.relatedTokens?.slice(0, 5).map(t => ({
          name: t.name,
          symbol: t.symbol
        })) || [],
        sampleData: {
          totalTokensFetched: sampleTokens.data.length,
          uniqueFirstLetters: Array.from(firstLetters).sort(),
          sampleTokenNames: sampleTokens.data.slice(0, 20).map(t => t.name),
          tokensStartingWithSameLetter: potentialMatches.slice(0, 10).map(t => ({
            name: t.name,
            symbol: t.symbol
          }))
        },
        searchSuggestions: this.generateSearchSuggestions(sampleTokens.data, query),
        apiStatus: {
          working: sampleTokens.data.length > 0,
          message: sampleTokens.data.length > 0 
            ? `API is working, fetched ${sampleTokens.data.length} tokens`
            : 'API might be down or rate limited'
        }
      };
      
      this.logger.log(`Diagnostic complete:`, JSON.stringify(diagnostic, null, 2));
      
      return {
        success: true,
        diagnostic
      };
    } catch (error) {
      this.logger.error('Search diagnostic failed:', error);
      return {
        success: false,
        error: error.message,
        diagnostic: {
          query,
          error: 'Diagnostic failed',
          suggestion: 'Check backend logs for details'
        }
      };
    }
  }

  /**
   * Debug endpoint - List all available tokens
   */
  @Get('debug/list-all')
  async listAllTokens(
    @Query('limit') limit = 100,
    @Query('offset') offset = 0
  ) {
    try {
      this.logger.log(`Fetching all available tokens - limit: ${limit}, offset: ${offset}`);
      
      // Fetch tokens from the API
      const result = await this.tokensService.getTrendingTokens(Number(limit), Number(offset));
      
      return {
        success: true,
        total: result.data.length,
        tokens: result.data.map(t => {
          // created_timestamp is already milliseconds; the old `* 1000` pushed
          // every date thousands of years into the future.
          const createdMs = Number(t.created_timestamp) || 0;
          return {
            name: t.name,
            symbol: t.symbol,
            mint: t.mint,
            marketCap: t.market_cap_usd ?? t.usd_market_cap ?? 0,
            created: createdMs ? new Date(createdMs).toISOString() : null,
            isLive: t.is_currently_live,
            isComplete: t.complete
          };
        }),
        message: `Showing ${result.data.length} tokens (offset: ${offset})`
      };
    } catch (error) {
      this.logger.error('Failed to list tokens:', error);
      return {
        success: false,
        error: error.message,
        tokens: []
      };
    }
  }

  /**
   * Helper method to generate search suggestions
   */
  private generateSearchSuggestions(tokens: any[], query: string): string[] {
    const suggestions = new Set<string>();
    
    // Get some popular token names as suggestions
    tokens.slice(0, 20).forEach(token => {
      if (token.name && token.name.length > 2) {
        // Take first word of multi-word names
        const firstWord = token.name.split(' ')[0];
        if (firstWord.length <= 20) {
          suggestions.add(firstWord);
        }
      }
      if (token.symbol && token.symbol.length <= 10) {
        suggestions.add(token.symbol);
      }
    });
    
    return Array.from(suggestions).slice(0, 10);
  }
}