/**
 * TCHATCHA — Port local : MediaFileRepository (37 §4).
 * Accès aux lignes media.files pour le presign/confirm (module media).
 * Les mutations VISIBLES (READY, bump version) passent par le writer du
 * module professionals (RF-PW-P01/P02/P03) — jamais par ce port.
 */

export interface MediaFileRecord {
  id: string;
  owner_id: string;
  purpose: string;
  media_type: string;
  mime_type: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
  duration_sec: number | null;
  url: string;
  s3_key: string;
  sort_order: number;
  status: string;
  created_at: Date;
}

export interface MediaFileRepository {
  /** Crée une ligne PROCESSING (presign, RF-MD-06 — invisible en vitrine). */
  createPending(input: {
    ownerId: string;
    purpose: string;
    mediaType: string;
    mimeType: string;
    sizeBytes: number;
    width: number | null;
    height: number | null;
    durationSec: number | null;
    url: string;
    s3Key: string;
  }): Promise<MediaFileRecord>;

  /** Ligne PROCESSING du pro (owner_type=PROFESSIONAL, profile id) — null sinon. */
  findOwnedProcessing(
    userId: string,
    mediaId: string,
  ): Promise<MediaFileRecord | null>;

  /** Ligne READY du pro (confirmé) — null si inconnue/d'un autre pro. */
  findOwnedReady(userId: string, mediaId: string): Promise<MediaFileRecord | null>;

  /** Marque FAILED (taille réelle > max, RF-MD-06). */
  markFailed(userId: string, mediaId: string): Promise<void>;

  /** Marque READY une ligne PROCESSING du pro (RF-VR-03, documents privés). */
  markReady(userId: string, mediaId: string): Promise<void>;

  /**
   * Purge des PROCESSING orphelins > olderThan (RF-MD-07) — renvoie les clés
   * S3 + purpose (bucket public/privé selon purpose, RF-VR-01).
   */
  purgeStale(
    profileId: string,
    olderThan: Date,
  ): Promise<Array<{ s3Key: string; purpose: string }>>;

  /** Nombre de PROCESSING en attente du pro (RF-MD-08, max 50). */
  countPending(profileId: string): Promise<number>;
}

export const MediaFileRepositoryToken = 'MediaFileRepository';
