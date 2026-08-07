/**
 * TCHATCHA — Adapter horloge système (ClockPort). Remplacé par un fake en test.
 */
import { Injectable } from '@nestjs/common';
import { ClockPort } from '../../application/ports/clock.port';

@Injectable()
export class SystemClock implements ClockPort {
  now(): Date {
    return new Date();
  }
}