/**
 * TCHATCHA — Espion SMS pour E2E : capture les codes OTP émis (jamais loggés
 * en clair en prod), pour rejouer otp/verify dans les scénarios G1–G5.
 */
import { Injectable } from '@nestjs/common';
import { OtpMessage, OtpSenderPort } from '../src/modules/auth/application/ports/otp-sender.port';

@Injectable()
export class TestSmsSpy implements OtpSenderPort {
  readonly sent = new Map<string, OtpMessage>();

  async send(message: OtpMessage): Promise<void> {
    const key = `${message.countryCode}:${message.phone}`;
    this.sent.set(key, message);
  }

  lastCode(countryCode: string, phone: string): string {
    return this.sent.get(`${countryCode}:${phone}`)?.code ?? '';
  }
}