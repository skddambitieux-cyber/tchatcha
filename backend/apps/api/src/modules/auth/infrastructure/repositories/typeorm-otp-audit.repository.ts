/**
 * TCHATCHA — Adapter TypeORM de OtpAuditRepositoryPort (trace `authz.otp_codes`).
 * Conservation des codes : hash SHA-256 uniquement, jamais en clair (15 §5).
 */
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OtpAuditRepositoryPort, OtpAuditRow } from '../../application/ports/otp-audit-repository.port';
import { OtpCode } from '../../domain/entities/otp-code.entity';

@Injectable()
export class TypeOrmOtpAuditRepository implements OtpAuditRepositoryPort {
  constructor(
    @InjectRepository(OtpCode)
    private readonly repo: Repository<OtpCode>,
  ) {}

  async record(row: OtpAuditRow): Promise<void> {
    await this.repo.save(
      this.repo.create({
        country_code: row.countryCode,
        phone: row.phone,
        purpose: row.purpose,
        code_hash: row.codeHash,
        expires_at: row.expiresAt,
        attempts: row.attempts,
        used_at: row.usedAt,
      }),
    );
  }
}