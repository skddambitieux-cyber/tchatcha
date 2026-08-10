/**
 * Tests unitaires S3StorageAdapter — docs/37 §4 (6.3.5a).
 * Les appels réseau S3 (HeadObject/DeleteObject) sont mockés via
 * S3Client.prototype.send ; getSignedUrl est mocké (signature locale).
 */
jest.mock('@aws-sdk/client-s3', () => {
  const actual = jest.requireActual('@aws-sdk/client-s3');
  return {
    ...actual,
    S3Client: jest.fn().mockImplementation(() => ({
      send: jest.fn(),
    })),
  };
});
jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn(),
}));

import { S3Client, DeleteObjectCommand, HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { S3StorageAdapter } from './s3-storage.adapter';
import { MediaStorageConfig } from '../config/media-storage.config';

const FAKE_CONFIG = {
  endpoint: 'http://minio.local:9000',
  region: 'auto',
  accessKeyId: 'minioadmin',
  secretAccessKey: 'minioadmin',
  bucketPublic: 'tchatcha',
  bucketPrivate: 'tchatcha-private',
  forcePathStyle: true,
  presignTtlSeconds: 900,
  publicUrlBase: 'http://minio.local:9000/tchatcha',
};

function makeAdapter(): { adapter: S3StorageAdapter; configGet: jest.Mock; send: jest.Mock } {
  const configGet = jest.fn().mockReturnValue(FAKE_CONFIG);
  const adapter = new S3StorageAdapter({ get: configGet } as unknown as MediaStorageConfig);
  const send = (S3Client as unknown as jest.Mock).mock.results[0].value.send;
  return { adapter, configGet, send };
}

describe('S3StorageAdapter — docs 37 §4 (6.3.5a)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('presignUpload : PutObjectCommand signé (bucket public, ContentType+Length)', async () => {
    const { adapter } = makeAdapter();
    (getSignedUrl as unknown as jest.Mock).mockResolvedValue('http://signed/put');

    const result = await adapter.presignUpload({
      key: 'BJ/PROFESSIONAL/prof-1/a.jpg',
      contentType: 'image/jpeg',
      sizeBytes: 2048,
      bucket: 'public',
    });

    expect(result).toEqual({ url: 'http://signed/put', expiresIn: 900 });
    const command = (getSignedUrl as unknown as jest.Mock).mock.calls[0][1];
    expect(command).toBeInstanceOf(PutObjectCommand);
    const input = (command as PutObjectCommand).input as Record<string, unknown>;
    expect(input).toMatchObject({
      Bucket: 'tchatcha',
      Key: 'BJ/PROFESSIONAL/prof-1/a.jpg',
      ContentType: 'image/jpeg',
      ContentLength: 2048,
    });
    const opts = (getSignedUrl as unknown as jest.Mock).mock.calls[0][2];
    expect(opts).toEqual({ expiresIn: 900 });
  });

  it('presignUpload : secret manquant → erreur explicite, pas de réseau', async () => {
    const { adapter, configGet } = makeAdapter();
    configGet.mockReturnValue({ ...FAKE_CONFIG, secretAccessKey: '' });
    await expect(
      adapter.presignUpload({
        key: 'k',
        contentType: 'image/jpeg',
        sizeBytes: 1,
        bucket: 'public',
      }),
    ).rejects.toThrow('S3_SECRET_ACCESS_KEY');
    expect(getSignedUrl).not.toHaveBeenCalled();
  });

  it('headObject : objet présent → méta', async () => {
    const { adapter, send } = makeAdapter();
    send.mockResolvedValue({ ContentLength: 4096, ContentType: 'image/png' });
    const meta = await adapter.headObject('BJ/PROFESSIONAL/prof-1/a.png', 'public');
    expect(meta).toEqual({ sizeBytes: 4096, contentType: 'image/png' });
    expect(send).toHaveBeenCalledWith(expect.any(HeadObjectCommand));
  });

  it('headObject : 404 → null (confirm 410)', async () => {
    const { adapter, send } = makeAdapter();
    send.mockRejectedValue({ $metadata: { httpStatusCode: 404 } });
    expect(await adapter.headObject('BJ/PROFESSIONAL/prof-1/a.jpg', 'public')).toBeNull();
  });

  it('headObject : erreur non-404 → propagée', async () => {
    const { adapter, send } = makeAdapter();
    send.mockRejectedValue(new Error('réseau'));
    await expect(adapter.headObject('k', 'public')).rejects.toThrow('réseau');
  });

  it('deleteObject : bucket privé utilisé (6.3.5b), commande envoyée', async () => {
    const { adapter, send } = makeAdapter();
    send.mockResolvedValue({});
    await adapter.deleteObject('BJ/PROFESSIONAL/prof-1/cin.pdf', 'private');
    expect(send).toHaveBeenCalledWith(expect.any(DeleteObjectCommand));
    const input = (send.mock.calls[0][0] as DeleteObjectCommand).input as Record<string, unknown>;
    expect(input.Bucket).toBe('tchatcha-private');
  });
});
