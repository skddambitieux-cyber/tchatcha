/**
 * TCHATCHA — Adapter TypeORM de SessionRepositoryPort (authz.refresh_tokens).
 * token_hash unique, jamais en clair. Rotation par famille (replaced_by).
 */
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import {
  RefreshSession,
  SessionRepositoryPort,
  StoredRefreshSession,
} from '../../application/ports/session-repository.port';
import { RefreshToken } from '../../domain/entities/refresh-token.entity';

function toStored(row: RefreshToken): StoredRefreshSession {
  return {
    id: row.id,
    userId: row.user_id,
    tokenHash: row.token_hash,
    deviceId: row.device_id,
    ip: row.ip,
    userAgent: row.user_agent,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    replacedById: row.replaced_by?.id ?? null,
  };
}

@Injectable()
export class TypeOrmSessionRepository implements SessionRepositoryPort {
  constructor(
    @InjectRepository(RefreshToken)
    private readonly repo: Repository<RefreshToken>,
  ) {}

  async save(session: RefreshSession): Promise<string> {
    const row = await this.repo.save(
      this.repo.create({
        user_id: session.userId,
        token_hash: session.tokenHash,
        device_id: session.deviceId,
        ip: session.ip,
        user_agent: session.userAgent,
        expires_at: session.expiresAt,
      }),
    );
    return row.id;
  }

  async findByTokenHash(tokenHash: string): Promise<StoredRefreshSession | null> {
    const row = await this.repo.findOne({
      where: { token_hash: tokenHash },
      relations: { replaced_by: true },
    });
    return row ? toStored(row) : null;
  }

  async markRotated(oldId: string, newId: string): Promise<void> {
    await this.repo.update(oldId, {
      revoked_at: new Date(),
      replaced_by: { id: newId } as unknown as RefreshToken,
    });
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.repo.update(
      { user_id: userId, revoked_at: IsNull() },
      { revoked_at: new Date() },
    );
  }

  async revokeByTokenHash(tokenHash: string): Promise<boolean> {
    const result = await this.repo.update(
      { token_hash: tokenHash },
      { revoked_at: new Date() },
    );
    return (result.affected ?? 0) > 0;
  }
}