/**
 * TCHATCHA — Port : envoi SMS OTP (D2). L'hexagone ne dépend que de ce contrat.
 * Implémentations : ConsoleSmsProvider (dev/test, D2), HttpSmsProvider (prod).
 */
export interface OtpMessage {
  countryCode: string;
  phone: string;
  code: string;
  expiresInSeconds: number;
}

export interface OtpSenderPort {
  send(message: OtpMessage): Promise<void>;
}

export const OtpSenderPortToken = 'OtpSenderPort';
