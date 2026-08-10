/**
 * TCHATCHA — StoragePort (37 §4, ADR-007, 02b-revue-architecture L119).
 * Port générique de stockage objet, indépendant du provider : protocole S3
 * (Cloudflare R2 en prod, MinIO en dev, AWS/GCS compatibles). Réutilisé par
 * 6.3.5b (bucket privé, CIN chiffré) et les autres modules — aucun usage
 * portfolio-specific ici.
 */

/** Bucket d'usage : public (portfolio, avatar) ou privé (CIN/docs — 6.3.5b). */
export type StorageBucket = 'public' | 'private';

export interface PresignUploadInput {
  /** Clé S3 complète (RF-MD-05 : {country}/{owner_type}/{owner_id}/{uuid}.{ext}). */
  key: string;
  /** Content-Type exact qui devra être envoyé au PUT (signé). */
  contentType: string;
  /** Taille déclarée en octets (bornée par RF-MD-03). */
  sizeBytes: number;
  bucket: StorageBucket;
}

export interface PresignUploadResult {
  /** URL PUT présignée, valide expiresIn secondes (RF-MD-04). */
  url: string;
  expiresIn: number;
}

export interface ObjectMeta {
  sizeBytes: number;
  contentType: string;
}

export interface StoragePort {
  /**
   * Signature d'une URL d'upload PUT. Le backend ne reçoit jamais le fichier
   * (ADR-007). TTL court : S3_PRESIGN_TTL_SECONDS (défaut 900 s).
   */
  presignUpload(input: PresignUploadInput): Promise<PresignUploadResult>;

  /** HEAD de l'objet — null si absent (utilisé au confirm, RF-MD-06). */
  headObject(key: string, bucket: StorageBucket): Promise<ObjectMeta | null>;

  /** Suppression de l'objet ; ignore les 404 (RF-MD-07, RF-PW-P03). */
  deleteObject(key: string, bucket: StorageBucket): Promise<void>;
}

export const StoragePortToken = 'StoragePort';
