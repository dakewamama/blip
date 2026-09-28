import { BadRequestException, Controller, Get, Param, ParseIntPipe, Query, DefaultValuePipe } from '@nestjs/common';
import { FeedFilter, FeedService, HistoryTimeframe } from './feed.service';

const FILTERS: FeedFilter[] = ['trending', 'new', 'gainers', 'safest', 'featured'];

@Controller('feed')
export class FeedController {
  constructor(private readonly feed: FeedService) {}

  /** The discover list: tokens plus their safety read, floor already applied. */
  @Get()
  async getFeed(
    @Query('filter') filter = 'trending',
    @Query('limit', new DefaultValuePipe(25), ParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
    @Query('includeUnsafe') includeUnsafe?: string,
  ) {
    if (!FILTERS.includes(filter as FeedFilter)) {
      throw new BadRequestException(`filter must be one of: ${FILTERS.join(', ')}`);
    }
    return this.feed.getFeed(filter as FeedFilter, Math.min(limit, 50), offset, {
      includeUnsafe: includeUnsafe === 'true',
    });
  }

  @Get('search')
  async search(
    @Query('q') q: string,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    if (!q?.trim()) throw new BadRequestException('q is required');
    return this.feed.search(q, Math.min(limit, 50));
  }

  /** Bucketed price history from the real trade tape. */
  @Get(':mint/history')
  async getHistory(
    @Param('mint') mint: string,
    @Query('timeframe', new DefaultValuePipe('minute')) timeframe: string,
    @Query('limit', new DefaultValuePipe(60), ParseIntPipe) limit: number,
  ) {
    const frames: HistoryTimeframe[] = ['minute', 'hour', 'day'];
    if (!frames.includes(timeframe as HistoryTimeframe)) {
      throw new BadRequestException(`timeframe must be one of: ${frames.join(', ')}`);
    }
    return this.feed.getHistory(mint, timeframe as HistoryTimeframe, Math.min(Math.max(limit, 5), 500));
  }

  @Get(':mint')
  async getToken(@Param('mint') mint: string) {
    const { token, safety } = await this.feed.getToken(mint);
    return { token, safety };
  }
}
