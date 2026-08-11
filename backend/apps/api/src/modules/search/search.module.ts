import { Module } from '@nestjs/common';
import { SearchProjectionPortToken } from './application/ports/search-projection.port';
import { TypeOrmSearchProjector } from './infrastructure/repositories/typeorm-search-projector';

@Module({
  providers: [
    {
      provide: SearchProjectionPortToken,
      useClass: TypeOrmSearchProjector,
    },
  ],
  exports: [SearchProjectionPortToken],
})
export class SearchModule {}
