/**
 * TCHATCHA — Adapter ProfessionalEventPublisherPort (D-EVT-1) : journalisation
 * console (pros.profile.updated). Port local du module professionals —
 * aucun import d'infrastructure auth (D-PORT-1). Bascule event-driven/outbox
 * en phase 2 (36 §8.2).
 */
import { Injectable, Logger } from '@nestjs/common';
import {
  ProfessionalDomainEvent,
  ProfessionalEventPublisherPort,
} from '../../application/ports/event-publisher.port';

@Injectable()
export class ConsoleProfessionalEventPublisher
  implements ProfessionalEventPublisherPort
{
  private readonly logger = new Logger('ProsDomainEvent');

  publish(event: ProfessionalDomainEvent): void {
    this.logger.log(`${event.type} ${JSON.stringify(event.payload)}`);
  }
}
