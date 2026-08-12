import { Controller, Get, Query } from '@nestjs/common';
import { SearchQueryService } from '../../application/services/search-query.service';
import { SearchQueryDto } from './dto/search-query.dto';

@Controller('search')
export class SearchController {
  constructor(private readonly service: SearchQueryService) {}

  @Get()
  search(@Query() query: SearchQueryDto) {
    return this.service.search(query);
  }
}
