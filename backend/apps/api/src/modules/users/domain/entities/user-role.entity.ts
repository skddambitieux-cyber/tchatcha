/**
 * TCHATCHA — users.user_roles (06a §2). Multi-rôles : un user peut être
 * client ET pro ET livreur (PRD). Table de liaison pure.
 */
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { User } from '../../../auth/domain/entities/user.entity';

export enum UserRole {
  CLIENT = 'CLIENT',
  PROFESSIONAL = 'PROFESSIONAL',
  DELIVERER = 'DELIVERER',
  ADMIN = 'ADMIN',
}

@Entity({ schema: 'users', name: 'user_roles' })
export class UserRoleEntity {
  @Column({ type: 'uuid', primary: true })
  user_id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'varchar', length: 32, primary: true })
  role: UserRole;

  @Column({ type: 'timestamptz' })
  granted_at: Date;
}