import { Module } from '@nestjs/common';
import { SearchProjectionPortToken } from './application/ports/search-projection.port';
import { TypeOrmSearchProjector } from './infrastructure/repositories/typeorm-search-projector';
import { SearchQueryPortToken } from './application/ports/search-query.port';
import { TypeOrmSearchQueryRepository } from './infrastructure/repositories/typeorm-search-query.repository';
import { SearchQueryService } from './application/services/search-query.service';
import { SearchController } from './interface/http/search.controller';

@Module({
  providers: [
    SearchQueryService,
    {
      provide: SearchProjectionPortToken,
      useClass: TypeOrmSearchProjector,
    },
    {
      provide: SearchQueryPortToken,
      useClass: TypeOrmSearchQueryRepository,
    },
  ],
  controllers: [SearchController],
  exports: [SearchProjectionPortToken],
})
export class SearchModule {}
