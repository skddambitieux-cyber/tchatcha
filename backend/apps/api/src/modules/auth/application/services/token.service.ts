/**
 * TCHATCHA — TokenService (28 §4). Sous-lots 3–5 : émission (register/login)
 * + rotation rotative par famille (ADR-004, D4).
 * Détection de rejeu : un refresh déjà remplacé/révoqué → révocation famille.
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
import { UserStatus } from '../../domain/entities/user.entity';
import { UserRole } from '../../domain/entities/user-role';
import {
  AccountLockedError,
  DeviceMismatchError,
  RefreshExpiredError,
  RefreshReusedError,
  RefreshUnknownError,
  TokenExpiredError,
} from '../../domain/errors/auth-errors';
import {
  EventPublisherPort,
  EventPublisherPortToken,
} from '../ports/event-publisher.port';
import {
  UserRepositoryPort,
  UserRepositoryPortToken,
} from '../ports/user-repository.port';
import { AuthTokens, DeviceInfo, UserPublic } from '../types/auth.types';

export const ACCESS_TTL_SECONDS = 900; // 15 min (26 §D3)
export const REFRESH_TTL_SECONDS = 30 * 24 * 3600; // 30 j

function hashToken(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export interface RotateInput {
  refreshToken: string;
  device: DeviceInfo;
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
    @Inject(UserRepositoryPortToken)
    private readonly users: UserRepositoryPort,
    @Inject(EventPublisherPortToken)
    private readonly events: EventPublisherPort,
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

  /** Valide un access token et retourne les claims (28 §4, 29 §2.3). */
  verifyAccess(token: string): TokenClaims {
    try {
      return this.tokens.verifyAccess(token);
    } catch (err) {
      if (err instanceof Error && err.name === 'TokenExpiredError') {
        throw new TokenExpiredError();
      }
      throw new RefreshUnknownError();
    }
  }

  async issueRefresh(user: UserPublic, device: DeviceInfo): Promise<string> {
    const created = await this.createRefreshSession(user, device);
    return created.opaque;
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

  /**
   * Rotation (D4 / 27 §6, 28 §4, 29 §2.3).
   * Lookup par hash → rejeu/révoqué → révocation famille ; expires_at passé →
   * RefreshExpired ; device incohérent → DeviceMismatch ; sinon rotation.
   */
  async rotate(input: RotateInput): Promise<AuthTokens> {
    const tokenHash = hashToken(input.refreshToken);
    const session = await this.sessions.findByTokenHash(tokenHash);
    if (!session) {
      throw new RefreshUnknownError();
    }
    const now = this.clock.now();

    // Rejeu : token déjà révoqué ou déjà remplacé → toute la famille révoquée.
    if (session.revokedAt || session.replacedById) {
      await this.sessions.revokeAllForUser(session.userId);
      this.events.publish({
        type: 'auth.session.revoked',
        payload: {
          user_id: session.userId,
          device_id: session.deviceId,
          reason: 'reuse_detected',
          ts: now.toISOString(),
        },
      });
      throw new RefreshReusedError();
    }

    if (session.expiresAt.getTime() <= now.getTime()) {
      throw new RefreshExpiredError();
    }

    if (
      input.device &&
      input.device.session_id &&
      input.device.session_id !== session.deviceId
    ) {
      throw new DeviceMismatchError();
    }

    const user = await this.users.findById(session.userId);
    if (!user) {
      throw new RefreshUnknownError();
    }
    if (user.status !== UserStatus.ACTIVE) {
      throw new AccountLockedError();
    }
    const role = (await this.users.findRole(user.id)) ?? UserRole.CLIENT;
    const userPublic: UserPublic = {
      id: user.id,
      role,
      full_name: user.full_name,
      phone: user.phone,
      status: user.status,
    };

    // Rotation : nouveau refresh enregistré, ancien lié via replaced_by.
    const created = await this.createRefreshSession(userPublic, input.device);
    await this.sessions.markRotated(session.id, created.id);

    this.events.publish({
      type: 'auth.session.rotated',
      payload: {
        user_id: user.id,
        device_id: input.device.session_id,
        ts: now.toISOString(),
      },
    });

    return {
      access_token: this.issueAccess(userPublic, input.device),
      token_type: 'Bearer',
      expires_in: ACCESS_TTL_SECONDS,
      refresh_token: created.opaque,
    };
  }

  private async createRefreshSession(
    user: UserPublic,
    device: DeviceInfo,
  ): Promise<{ opaque: string; id: string }> {
    const opaque = randomBytes(40).toString('base64url');
    const tokenHash = hashToken(opaque);
    const now = this.clock.now();
    const id = await this.sessions.save({
      userId: user.id,
      tokenHash,
      deviceId: device.session_id,
      ip: device.ip ?? '0.0.0.0',
      userAgent: device.user_agent ?? null,
      expiresAt: new Date(now.getTime() + REFRESH_TTL_SECONDS * 1000),
    });
    return { opaque, id };
  }
}