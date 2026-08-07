/**
 * TCHATCHA — Adapter mémoire de OtpStorePort (dev/test, D-STORE-1).
 * Remplacement par Redis en P2 sans modifier le service (hexagonal).
 * Non partagé : Map in-process, données perdues au redémarrage — OK pour
 * les tests et le dev local.
 */
import { Injectable } from '@nestjs/common';
import {
  OtpStorePort,
  OtpSendState,
  PendingOtp,
} from '../ports/otp-store.port';
import { OtpPurpose } from '../../domain/entities/otp-code.entity';

@Injectable()
export class InMemoryOtpStore implements OtpStorePort {
  private readonly otps = new Map<string, PendingOtp>();
  private readonly sendStates = new Map<string, OtpSendState>();

  key(phone: string, purpose: OtpPurpose): string {
    return `${phone}::${purpose}`;
  }

  async saveOtp(otp: PendingOtp): Promise<void> {
    this.otps.set(this.key(otp.phone, otp.purpose), { ...otp });
  }

  async findOtp(
    phone: string,
    purpose: OtpPurpose,
  ): Promise<PendingOtp | null> {
    const otp = this.otps.get(this.key(phone, purpose));
    if (!otp) return null;
    // Expiré = retourné tel quel ; l'expiration est appliquée par le service
    // (permet de distinguer OtpExpired de NoPendingOtp).
    return { ...otp };
  }

  async consume(
    phone: string,
    purpose: OtpPurpose,
    usedAt: Date,
  ): Promise<boolean> {
    const key = this.key(phone, purpose);
    const otp = this.otps.get(key);
    if (!otp || otp.usedAt) return false;
    this.otps.set(key, { ...otp, usedAt });
    return true;
  }

  async invalidate(phone: string, purpose: OtpPurpose): Promise<void> {
    this.otps.delete(this.key(phone, purpose));
  }

  async incrementAttempts(
    phone: string,
    purpose: OtpPurpose,
  ): Promise<number> {
    const otp = this.otps.get(this.key(phone, purpose));
    if (!otp) return 1;
    const attempts = otp.attempts + 1;
    this.otps.set(this.key(phone, purpose), { ...otp, attempts });
    return attempts;
  }

  async getSendState(phone: string): Promise<OtpSendState> {
    const now = Date.now();
    const state = this.sendStates.get(phone);
    if (!state) {
      return { lastSentAt: null, sendAt: [], lockedUntil: null };
    }
    // Nettoie la fenêtre des envois plus vieux que 15 min.
    const sendAt = state.sendAt.filter((d) => now - d.getTime() < 900_000);
    return { ...state, sendAt };
  }

  async recordSend(phone: string, at: Date): Promise<void> {
    const state = await this.getSendState(phone);
    state.lastSentAt = at;
    const within = state.sendAt.filter(
      (t) => at.getTime() - t.getTime() <= 900_000,
    );
    within.push(at);
    this.sendStates.set(phone, { ...state, lastSentAt: at, sendAt: within });
  }

  async lock(phone: string, until: Date): Promise<void> {
    const state = await this.getSendState(phone);
    this.sendStates.set(phone, { ...state, lockedUntil: until });
  }
}