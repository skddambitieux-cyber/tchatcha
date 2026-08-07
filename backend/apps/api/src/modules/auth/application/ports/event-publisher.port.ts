/**
 * TCHATCHA — Port : événements de domaine (28 §7). Au MVP émission synchrone
 * (D-EVT-1) via EventEmitter/console ; passage outbox en phase 2.
 */
export interface AuthEvent {
  type: string;
  payload: Record<string, unknown>;
}

export interface EventPublisherPort {
  publish(event: AuthEvent): void;
}

export const EventPublisherPortToken = 'EventPublisherPort';