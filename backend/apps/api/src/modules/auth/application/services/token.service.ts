/**
 * TCHATCHA — TokenService (28 §4). Sous-lot 3 : ÉMISSION seule (register).
 * Le login (sous-lot 4) réutilise ce service. Rotation rejeu : sous-lot refresh.
 */
import { Inject, Injectable } from '@nestjs/common';
import { randomBytes, randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';
import {
  SessionRepositoryPort,
  SessionRepositoryPortToken,
} from '../ports/session-repository.port';
import {
  TokenClaims,
  TokenManagerPort,
  TokenManagerPortToken,
} from '../ports/token-manager.port';
import { ClockPort, ClockPortToken } from '../ports/clock.port';
import { UserRole } from '../../domain/entities/user-role';
import { AuthTokens, DeviceInfo, UserPublic } from '../types/auth.types';

export const ACCESS_TTL_SECONDS = 900; // 15 min (26 §D3)
export const REFRESH_TTL_SECONDS = 30 * 24 * 3600; // 30 j

function hashToken(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

@Injectable()
export class TokenService {
  constructor(
    @Inject(TokenManagerPortToken)
    private readonly tokens: TokenManagerPort,
    @Inject(SessionRepositoryPortToken)
    private readonly sessions: SessionRepositoryPort,
    @Inject(ClockPortToken)
    private readonly clock: ClockPort,
  ) {}

  issueAccess(user: UserPublic, device?: DeviceInfo): string {
    const claims: TokenClaims = {
      sub: user.id,
      role: user.role,
      device_id: device?.session_id ?? 'unknown',
      jti: randomUUID(),
      exp: Math.floor(this.clock.now().getTime() / 1000) + ACCESS_TTL_SECONDS,
    };
    return this.tokens.signAccess(claims);
  }

  /** Refresh opaque ≥ 32 octets, stocké uniquement en hash SHA-256 (06a §1). */
  async issueRefresh(user: UserPublic, device: DeviceInfo): Promise<string> {
    const opaque = randomBytes(40).toString('base64url');
    const tokenHash = hashToken(opaque);
    const now = this.clock.now();
    await this.sessions.save({
      userId: user.id,
      tokenHash,
      deviceId: device.session_id,
      ip: device.ip ?? '0.0.0.0',
      userAgent: device.user_agent ?? null,
      expiresAt: new Date(now.getTime() + REFRESH_TTL_SECONDS * 1000),
    });
    return opaque;
  }

  async issuePair(
    user: UserPublic,
    device: DeviceInfo,
  ): Promise<AuthTokens> {
    return {
      access_token: this.issueAccess(user, device),
      token_type: 'Bearer',
      expires_in: ACCESS_TTL_SECONDS,
      refresh_token: await this.issueRefresh(user, device),
    };
  }
}