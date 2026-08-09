/**
 * TCHATCHA — Adapter TypeORM de UserRepositoryPort (schéma `users`, 06a §2).
 * Auth n'importe jamais un autre module : il mappe localement la table users.
 * D3 : createPending crée un compte PENDING_OTP à la demande d'OTP REGISTER.
 * Activation register : transaction atomique + FOR UPDATE (28 §6), rôle
 * verrouillé (D5), consentements (users.consents), extras par rôle.
 */
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  ActivateCommand,
  UpdateProfileCommand,
  UserRepositoryPort,
} from '../../application/ports/user-repository.port';
import { OtpPurpose } from '../../domain/entities/otp-code.entity';
import { User, UserStatus } from '../../domain/entities/user.entity';
import { UserRole } from '../../../users/domain/entities/user-role.entity';
import { Consent } from '../../../users/domain/entities/consent.entity';
import { UserRoleEntity } from '../../../users/domain/entities/user-role.entity';
import { ProfessionalProfile, ProfessionalStatus } from '../../../professionals/domain/entities/professional-profile.entity';
import { EmailAlreadyRegisteredError, PhoneAlreadyActiveError } from '../../domain/errors/auth-errors';

@Injectable()
export class TypeOrmUserRepository implements UserRepositoryPort {
  constructor(
    @InjectRepository(User)
    private readonly repo: Repository<User>,
    @InjectRepository(UserRoleEntity)
    private readonly roleRepo: Repository<UserRoleEntity>,
    private readonly dataSource: DataSource,
  ) {}

  async findByPhone(
    countryCode: string,
    phone: string,
  ): Promise<User | null> {
    return this.repo.findOne({
      where: { country_code: countryCode, phone },
    });
  }

  async findById(userId: string): Promise<User | null> {
    return this.repo.findOne({ where: { id: userId } });
  }

  async findRole(userId: string): Promise<UserRole | null> {
    const row = await this.roleRepo.findOne({
      where: { user_id: userId },
      order: { granted_at: 'ASC' },
    });
    return row?.role ?? null;
  }

  async findRolesById(userId: string): Promise<UserRole[]> {
    const rows = await this.roleRepo.find({
      where: { user_id: userId },
      order: { granted_at: 'ASC' },
    });
    return rows.map((r) => r.role);
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

  async activateRegistration(
    userId: string,
    input: ActivateCommand,
  ): Promise<User> {
    return this.dataSource.transaction(async (manager) => {
      // Verrou pessimiste : 2 register simultanés → 1 gagne (29 §2.5).
      const user = await manager.findOne(User, {
        where: { id: userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!user) {
        throw new Error('account_not_found');
      }
      if (user.status !== UserStatus.PENDING_OTP) {
        // course : un autre register a déjà activé le compte
        throw new PhoneAlreadyActiveError();
      }
      user.status = UserStatus.ACTIVE;
      user.full_name = input.fullName;
      await manager.save(user);
      await manager.save(
        manager.create(UserRoleEntity, {
          user_id: user.id,
          role: input.role,
          granted_at: new Date(),
        }),
      );
      for (const c of input.consents) {
        await manager.save(
          manager.create(Consent, {
            user_id: user.id,
            type: c.type,
            version: c.version,
            granted: c.granted,
            granted_at: c.granted ? new Date() : null,
          }),
        );
      }
      if (input.pro) {
        await manager.save(
          manager.create(ProfessionalProfile, {
            user_id: user.id,
            status: ProfessionalStatus.PENDING_VERIFICATION,
            verified: false,
            currency: 'XOF',
            country_code: user.country_code,
          }),
        );
      }
      return manager.findOne(User, { where: { id: user.id } }) as Promise<User>;
    });
  }

  async updateProfile(
    userId: string,
    input: UpdateProfileCommand,
  ): Promise<User | null> {
    try {
      const { affected } = await this.repo
        .createQueryBuilder()
        .update(User)
        .set({
          full_name: input.fullName,
          locale: input.locale,
          email: input.email,
          avatar_url: input.avatarUrl,
          version: () => '"version" + 1',
        })
        .where('id = :id', { id: userId })
        .andWhere('version = :version', { version: input.expectedVersion })
        .andWhere('deleted_at IS NULL')
        .execute();
      if (!affected) {
        return null;
      }
      return this.findById(userId);
    } catch (err) {
      // 23505 : violation de uq_users_email (06a §2) — email porté par un autre compte.
      if (
        err &&
        typeof err === 'object' &&
        (err as { driverError?: { code?: string } }).driverError?.code === '23505'
      ) {
        throw new EmailAlreadyRegisteredError();
      }
      throw err;
    }
  }
}