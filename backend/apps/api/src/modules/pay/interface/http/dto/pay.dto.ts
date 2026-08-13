/**
 * TCHATCHA — DTO paiements (FCT-013). L'initiation ne porte QUE le booking :
 * montant/devise viennent du serveur (booking ← devis accepté), jamais du client.
 */
import { IsString, IsUUID, Matches } from 'class-validator';

export class InitiatePaymentDto {
  @IsUUID()
  booking_id: string;
}

export class VerifyPaymentDto {
  @IsString()
  @Matches(/^\d{6}$/, { message: 'code must be a 6-digit code' })
  code: string;
}