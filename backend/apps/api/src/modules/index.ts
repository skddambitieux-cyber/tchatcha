/**
 * TCHATCHA — modules : point d'entrée des domaines métier.
 * Chaque module expose : Module NestJS + ses use-cases + ses ports.
 * Monolithe modulaire (ADR-001) — 1 dossier = 1 module (04-arborescence).
 */
export * as AuthModule from './auth';
export * as UsersModule from './users';
export * as GeoModule from './geo';
export * as ProfessionalsModule from './professionals';
export * as MarketModule from './market';
export * as PayModule from './pay';
export * as ReviewModule from './review';
export * as MessagingModule from './messaging';
export * as NotifModule from './notifications';
export * as AdminModule from './admin';
export * as AuditModule from './audit';
export * as MediaModule from './media';
