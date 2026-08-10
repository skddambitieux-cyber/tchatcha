/**
 * TCHATCHA — Port : événements de domaine du module professionals (36 §5.2,
 * RF-PW-W11). Même shape que EventPublisherPort (auth, D-EVT-1). L'émission
 * est synchrone MVP et n'intervient qu'après le succès complet de la mutation
 * (jamais pendant une transaction, jamais sur rollback).
 */
export interface ProfessionalDomainEvent {
  type: string;
  payload: Record<string, unknown>;
}

export interface ProfessionalEventPublisherPort {
  publish(event: ProfessionalDomainEvent): void;
}

export const ProfessionalEventPublisherPortToken =
  'ProfessionalEventPublisherPort';
