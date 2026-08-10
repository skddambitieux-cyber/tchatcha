/**
 * TCHATCHA — Port local : lecture de la vitrine pro pour `/me` (32 §2, D-ME-2).
 * L'adaptateur mappe localement la table pros.profiles (D-PORT-1) sans
 * dépendre des classes du module professionals.
 */

/** Projection vitrine pro pour `/me` (31 §1 MeProfessional) — port local auth (D-PORT-1). */
export interface ProfessionalProfileView {
  id: string;
  business_name: string | null;
  status: string;
  verified: boolean;
  verified_at: Date | null;
  rating_avg: number;
  rating_count: number;
  trust_score: number;
  completed_jobs: number;
  location_name: string | null;
  /** Rôle principal du compte (users.user_roles) — RF-PW02, presign 6.3.5a. */
  role: string | null;
  /** État du compte propriétaire (users.users.status) — gardes 403. */
  user_status: string;
  /** RGPD : compte anonymisé → 403 resource_unavailable. */
  anonymized_at: Date | null;
  /** Pays du profil — clé S3 {country}/... (RF-MD-05). */
  country_code: string;
}

export interface ProfessionalProfileReadPort {
  /** Vitrine pro (pros.profiles) d'un user — null si profil absent (32 §2). */
  findByUserId(userId: string): Promise<ProfessionalProfileView | null>;
}

export const ProfessionalProfileReadPortToken = 'ProfessionalProfileReadPort';