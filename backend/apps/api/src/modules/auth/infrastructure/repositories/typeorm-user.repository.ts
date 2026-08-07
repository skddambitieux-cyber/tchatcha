/**
 * TCHATCHA — Adapter TypeORM de UserRepositoryPort (schéma `users`, 06a §2).
 * Auth n'importe jamais un autre module : il mappe localement la table users.
 * D3 : createPending crée un compte PENDING_OTP à la demande d'OTP REGISTER.
 */
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  UserRepositoryPort,
} from '../../application/ports/user-repository.port';
import { OtpPurpose } from '../../domain/entities/otp-code.entity';
import { User, UserStatus } from '../../domain/entities/user.entity';

@Injectable()
export class TypeOrmUserRepository implements UserRepositoryPort {
  constructor(
    @InjectRepository(User)
    private readonly repo: Repository<User>,
  ) {}

  async findByPhone(
    countryCode: string,
    phone: string,
  ): Promise<User | null> {
    return this.repo.findOne({
      where: { country_code: countryCode, phone },
    });
  }

  async createPending(
    countryCode: string,
    phone: string,
    purpose: OtpPurpose,
  ): Promise<User> {
    return this.repo.save(
      this.repo.create({
        country_code: countryCode,
        phone,
        status: UserStatus.PENDING_OTP,
        password_hash: '',
        full_name: '',
        flags: { otp_purpose: purpose },
      }),
    );
  }

  async markOtpVerified(userId: string): Promise<void> {
    await this.repo.update(userId, {
      otp_verified_at: new Date(),
    });
  }

  async updateStatus(userId: string, status: UserStatus): Promise<void> {
    await this.repo.update(userId, { status });
  }
}