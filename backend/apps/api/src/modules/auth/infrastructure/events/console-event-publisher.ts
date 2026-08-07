/**
 * TCHATCHA — Adapter EventPublisherPort (D-EVT-1) : journalisation console
 * (auth.user.registered etc.). Bascule event-driven par message broker en P3.
 */
import { Injectable, Logger } from '@nestjs/common';
import { AuthEvent, EventPublisherPort } from '../../application/ports/event-publisher.port';

@Injectable()
export class ConsoleEventPublisher implements EventPublisherPort {
  private readonly logger = new Logger('AuthDomainEvent');

  publish(event: AuthEvent): void {
    this.logger.log(`${event.type} ${JSON.stringify(event.payload)}`);
  }
}