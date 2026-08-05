/**
 * TCHATCHA — pay.transactions (06b §2). Transaction unique, agnostique
 * fournisseur (ADR-015). Source de vérité comptable.
 */
import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../../shared/entities/base.entity';

export enum TransactionType {
  SERVICE_PAYMENT = 'SERVICE_PAYMENT',
  ORDER_PAYMENT = 'ORDER_PAYMENT',
  SUBSCRIPTION = 'SUBSCRIPTION',
  REFUND = 'REFUND',
  PAYOUT = 'PAYOUT',
  WALLET_CREDIT = 'WALLET_CREDIT',
}

export enum TransactionStatus {
  PENDING = 'PENDING',
  AUTHORIZED = 'AUTHORIZED',
  SUCCEEDED = 'SUCCEEDED',
  FAILED = 'FAILED',
  REFUNDED = 'REFUNDED',
  REVERSED = 'REVERSED',
}

@Entity({ schema: 'pay', name: 'transactions' })
@Index('idx_transactions_user', ['user_id', 'created_at'])
@Index('idx_transactions_booking', ['booking_id'])
@Index('idx_transactions_status', ['status'])
export class Transaction extends BaseEntity {
  @Column({ type: 'uuid' })
  user_id: string;

  @Column({ type: 'varchar', length: 32 })
  type: TransactionType;

  @Column({ type: 'varchar', length: 32 })
  status: TransactionStatus;

  @Column({ type: 'numeric', precision: 14, scale: 2 })
  amount: number;

  @Column({ type: 'numeric', precision: 14, scale: 2, default: 0 })
  fee: number;

  @Column({ type: 'char', length: 3 })
  currency: string;

  @Column({ type: 'uuid', nullable: true })
  booking_id: string | null;

  @Column({ type: 'uuid', nullable: true })
  order_id: string | null;

  @Column({ type: 'uuid', nullable: true })
  subscription_id: string | null;

  @Column({ type: 'char', length: 2 })
  country_code: string;

  @Column({ type: 'int', default: 1 })
  version: number;
}

/**
 * TCHATCHA — pay.provider_operations (06b §2). Isolateur de fournisseurs :
 * MTN_MOMO, MOOV_MONEY, CELTIIS_CASH, CARD… Une ligne par tentative.
 */
@Entity({ schema: 'pay', name: 'provider_operations' })
@Index('idx_provider_ops_transaction', ['transaction_id'])
@Index('uq_provider_ops_external', ['provider_code', 'external_ref'], {
  unique: true,
  where: 'external_ref IS NOT NULL',
})
export class ProviderOperation extends BaseEntity {
  @Column({ type: 'uuid' })
  transaction_id: string;

  @Column({ type: 'varchar', length: 32 })
  provider_code: string;

  @Column({ type: 'varchar', length: 32 })
  operation_type: string;

  @Column({ type: 'varchar', length: 128, nullable: true })
  external_ref: string | null;

  @Column({ type: 'varchar', length: 32 })
  status: string;

  @Column({ type: 'numeric', precision: 14, scale: 2 })
  amount: number;

  @Column({ type: 'jsonb', nullable: true })
  request_payload: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true })
  response_payload: Record<string, unknown> | null;

  @Column({ type: 'timestamptz' })
  initiated_at: Date;

  @Column({ type: 'timestamptz', nullable: true })
  completed_at: Date | null;
}

/**
 * TCHATCHA — pay.payouts (06b §2). Virements vers les pros (PRD §19 Revenus).
 */
@Entity({ schema: 'pay', name: 'payouts' })
@Index('idx_payouts_pro', ['professional_id', 'requested_at'])
export class Payout extends BaseEntity {
  @Column({ type: 'uuid' })
  professional_id: string;

  @Column({ type: 'numeric', precision: 14, scale: 2 })
  amount: number;

  @Column({ type: 'char', length: 3 })
  currency: string;

  @Column({ type: 'varchar', length: 32 })
  status: string;

  @Column({ type: 'uuid', nullable: true })
  provider_operation_id: string | null;

  @Column({ type: 'timestamptz' })
  requested_at: Date;

  @Column({ type: 'timestamptz', nullable: true })
  completed_at: Date | null;
}