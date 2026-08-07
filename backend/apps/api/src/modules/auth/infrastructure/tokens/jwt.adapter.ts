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
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  signAccess(payload: TokenClaims): string {
    return this.jwt.sign(payload, {
      secret: this.config.get<string>('JWT_SECRET'),
      expiresIn: '15m',
    });
  }

  verifyAccess(token: string): TokenClaims {
    return this.jwt.verify<TokenClaims>(token, {
      secret: this.config.get<string>('JWT_SECRET'),
    });
  }
}