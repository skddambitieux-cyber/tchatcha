/**
 * TCHATCHA — Health check. Vérifie que l'app démarre (infrastructure OK).
 * Sans logique métier — Étape 6.1. Répond aussi sans DB (liveness), et
 * indique l'état de la base si disponible (readiness plus tard).
 */
import { Controller, Get } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Controller('health')
export class HealthController {
  constructor(private readonly dataSource: DataSource) {}

  @Get()
  async check() {
    const db = await this.isDatabaseUp() ? 'up' : 'down';
    return {
      status: 'ok',
      service: 'tchatcha-api',
      db,
      timestamp: new Date().toISOString(),
    };
  }

  private async isDatabaseUp(): Promise<boolean> {
    try {
      await this.dataSource.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }
}