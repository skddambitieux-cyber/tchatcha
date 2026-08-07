/**
 * TCHATCHA — Adapter TypeORM de SessionRepositoryPort (authz.refresh_tokens).
 * Douceur : token_hash unique, enfant jamais clair.
 */
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  RefreshSession,
  SessionRepositoryPort,
} from '../../application/ports/session-repository.port';
import { RefreshToken } from '../../domain/entities/refresh-token.entity';

@Injectable()
export class TypeOrmSessionRepository implements SessionRepositoryPort {
  constructor(
    @InjectRepository(RefreshToken)
    private readonly repo: Repository<RefreshToken>,
  ) {}

  async save(session: RefreshSession): Promise<void> {
    await this.repo.save(
      this.repo.create({
        user_id: session.userId,
        token_hash: session.tokenHash,
        device_id: session.deviceId,
        ip: session.ip,
        user_agent: session.userAgent,
        expires_at: session.expiresAt,
      }),
    );
  }
}