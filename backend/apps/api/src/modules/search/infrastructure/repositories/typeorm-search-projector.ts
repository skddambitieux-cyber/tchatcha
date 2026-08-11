import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { SearchProjectionPort } from '../../application/ports/search-projection.port';

@Injectable()
export class TypeOrmSearchProjector implements SearchProjectionPort {
  constructor(private readonly dataSource: DataSource) {}

  async rebuild(professionalId: string): Promise<void> {
    await this.dataSource.query(
      `SELECT search.rebuild_professional_search_doc($1::uuid)`,
      [professionalId],
    );
  }
}
