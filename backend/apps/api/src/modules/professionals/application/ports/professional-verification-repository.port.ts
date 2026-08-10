/**
 * TCHATCHA — Port local : ProfessionalVerificationRepository (38 §5).
 * Accès aux lignes pros.verifications pour la soumission/lecture du dossier
 * du pro (6.3.5b-1). La file admin.validation_tasks est écrite ici aussi
 * (créée à la soumission, RF-VR-05) — SQL brut, isolation de module (D-PORT-1).
 * Les décisions admin (6.3.5b-2) passent par le module admin (ports séparés).
 */

export interface VerificationRecord {
  id: string;
  professional_id: string;
  type: string;
  media_id: string;
  mime_type: string;
  status: string;
  reviewed_by: string | null;
  reviewed_at: Date | null;
  note: string | null;
  created_at: Date;
}

export interface ProfessionalVerificationRepository {
  /**
   * Ligne du pro (par user) pour un type singleton (NATIONAL_ID/SELFIE).
   * null si aucune (RF-VR-02/04).
   */
  findByType(userId: string, type: string): Promise<VerificationRecord | null>;

  /** Toutes les lignes du pro (GET dossier, RF-VR-06) — tri type, créé. */
  listByProfessional(userId: string): Promise<VerificationRecord[]>;

  /** Vrai si le média est déjà référencé par une ligne (422 document_already_used). */
  isMediaReferenced(mediaId: string): Promise<boolean>;

  /** Crée la ligne PENDING + sa tâche admin.validation_tasks (transaction, RF-VR-03/05). */
  createPending(input: {
    userId: string;
    type: string;
    mediaId: string;
  }): Promise<VerificationRecord>;

  /** Réactive une ligne REJECTED (nouveau média, PENDING) + tâche admin (RF-VR-04). */
  reactivateRejected(
    userId: string,
    verificationId: string,
    mediaId: string,
  ): Promise<boolean>;
}

export const ProfessionalVerificationRepositoryToken =
  'ProfessionalVerificationRepository';
