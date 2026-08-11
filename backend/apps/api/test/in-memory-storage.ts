/**
 * TCHATCHA — Double de test du StoragePort (6.3.5a) : aucun réseau S3.
 * presignUpload retourne une URL factice ; headObject simule l'objet
 * présent ; deleteObject enregistre les suppressions (assertions e2e).
 */
import { StoragePort, PresignUploadInput, ObjectMeta } from '../src/modules/media/domain/ports/storage.port';

export class InMemoryStorage implements StoragePort {
  public readonly deletedKeys: string[] = [];
  public lastPresignInput: PresignUploadInput | null = null;
  private missingKeys: Set<string> = new Set();
  private headOverride: Record<string, ObjectMeta> = {};

  markMissing(key: string): void {
    this.missingKeys.add(key);
  }

  overrideHead(key: string, head: { size_bytes: number; mime_type: string }): void {
    this.headOverride[key] = {
      sizeBytes: head.size_bytes,
      contentType: head.mime_type,
    };
  }

  async presignUpload(input: PresignUploadInput): Promise<{ url: string; expiresIn: number }> {
    this.lastPresignInput = input;
    return {
      url: `http://fake-storage.local/presign/${input.key}?mime=${encodeURIComponent(input.contentType)}&size=${input.sizeBytes}`,
      expiresIn: 900,
    };
  }

  async presignRead(input: { key: string; bucket: 'public' | 'private' }): Promise<{ url: string; expiresIn: number }> {
    return { url: `http://fake-storage.local/read/${input.key}`, expiresIn: 900 };
  }

  async headObject(key: string): Promise<ObjectMeta | null> {
    if (this.missingKeys.has(key)) return null;
    if (this.headOverride[key]) return this.headOverride[key];
    return { sizeBytes: 1024, contentType: 'image/jpeg' };
  }

  async deleteObject(key: string): Promise<void> {
    this.deletedKeys.push(key);
  }
}
