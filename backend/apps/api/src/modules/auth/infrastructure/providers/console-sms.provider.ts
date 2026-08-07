/**
 * TCHATCHA — Adapter SMS console (D2). En dev/test : journalise le code
 * (tout code en clair N'EST JAMAIS loggé en prod — 15 §5). Production :
 * remplacer par HttpSmsProvider branchant SMS Bénin/Intouch.
 */
import { Injectable, Logger } from '@nestjs/common';
import { OtpMessage, OtpSenderPort } from '../ports/otp-sender.port';

@Injectable()
export class ConsoleSmsProvider implements OtpSenderPort {
  private readonly logger = new Logger(ConsoleSmsProvider.name);

  async send(message: OtpMessage): Promise<void> {
    this.logger.log(
      `[SMS DEV] ${message.countryCode} ${message.phone} → code=${message.code}, ` +
        `valide ${message.expiresInSeconds}s`,
      'ConsoleSmsProvider',
    );
  }
}