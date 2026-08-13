/**
 * TCHATCHA — Module pay (FCT-013). Hexagonal : PayService dépend des ports ;
 * simulateur (PaymentGatewayPort — aucun opérateur réel dans ce lot) et
 * repository TypeORM injectés ici. Consomme OtpService du module auth
 * (OTP PAYMENT = autorisation utilisateur).
 */
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Payout, ProviderOperation, Transaction } from './domain/entities/pay.entity';
import { WebhookEvent } from './domain/entities/webhook-event.entity';
import { AuthModule } from '../auth/auth.module';
import { PayService } from './application/services/pay.service';
import { PayRepositoryPortToken } from './application/ports/pay-repository.port';
import { PaymentGatewayPortToken } from './application/ports/payment-gateway.port';
import { TypeOrmPayRepository } from './infrastructure/repositories/typeorm-pay.repository';
import { SimulatorPaymentGateway } from './infrastructure/gateways/simulator-payment.gateway';
import { PaymentsController } from './interface/http/payments.controller';
import { PaymentsWebhookController } from './interface/http/payments-webhook.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Transaction, ProviderOperation, Payout, WebhookEvent]),
    AuthModule,
  ],
  controllers: [PaymentsController, PaymentsWebhookController],
  providers: [
    PayService,
    { provide: PayRepositoryPortToken, useClass: TypeOrmPayRepository },
    { provide: PaymentGatewayPortToken, useClass: SimulatorPaymentGateway },
  ],
  exports: [TypeOrmModule],
})
export class PayModule {}
