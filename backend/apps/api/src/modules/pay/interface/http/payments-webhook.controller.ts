/**
 * TCHATCHA — Controller webhooks fournisseur (FCT-013, 12-api-blueprint.md §8).
 * NON authentifié par token : signature `X-Tchatcha-Signature: sha256=HMAC(secret, body)`
 * sur le corps brut (rawBody), comparée en temps constant. Réponse 2xx attendue,
 * sinon retries du fournisseur ; déduplication via uq_webhook_events.
 */
import { Request } from 'express';
import type { RawBodyRequest } from '@nestjs/common';
import {
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { PayService } from '../../application/services/pay.service';

@Controller('payments/webhook')
export class PaymentsWebhookController {
  constructor(private readonly pay: PayService) {}
  @Post(':provider') @HttpCode(HttpStatus.OK) handle(
    @Param('provider') provider: string,
    @Req() req: RawBodyRequest<Request>,
  ) {
    return this.pay.handleWebhook(
      provider,
      req.headers['x-tchatcha-signature'] as string | undefined,
      req.rawBody ?? Buffer.alloc(0),
    );
  }
}