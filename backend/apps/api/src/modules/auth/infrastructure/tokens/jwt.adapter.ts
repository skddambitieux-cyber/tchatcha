/**
 * TCHATCHA — Adapter JWT (TokenManagerPort). HS256 avec JWT_SECRET (env.validation).
 * Claims : sub (user id), role, device_id, jti (uuid), exp = +900 s (15 min, 26 §D3).
 */
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { TokenClaims, TokenManagerPort } from '../../application/ports/token-manager.port';

@Injectable()
export class JwtAdapter implements TokenManagerPort {
  private readonly secret: string;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {
    const secret = this.config.get<string>('JWT_SECRET');
    if (!secret?.trim()) {
      throw new Error('JWT_SECRET est obligatoire pour démarrer l’API.');
    }
    this.secret = secret;
  }

  signAccess(payload: TokenClaims): string {
    return this.jwt.sign(payload, {
      secret: this.secret,
    });
  }

  verifyAccess(token: string): TokenClaims {
    return this.jwt.verify<TokenClaims>(token, {
      secret: this.secret,
    });
  }
}
