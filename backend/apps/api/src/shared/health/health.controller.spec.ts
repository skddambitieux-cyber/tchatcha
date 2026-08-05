import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('répond ok avec db up quand SELECT 1 réussit', async () => {
    const dataSource = {
      query: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    } as unknown as DataSource;
    const controller = new HealthController(dataSource);
    const result = await controller.check();
    expect(result.status).toBe('ok');
    expect(result.db).toBe('up');
  });

  it('signale db down si la base est injoignable (sans crasher)', async () => {
    const dataSource = {
      query: jest.fn().mockRejectedValue(new Error('connexion refusée')),
    } as unknown as DataSource;
    const controller = new HealthController(dataSource);
    const result = await controller.check();
    expect(result.status).toBe('ok');
    expect(result.db).toBe('down');
  });

  it('est instanciable via le module de test Nest', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: DataSource,
          useValue: { query: jest.fn().mockResolvedValue([]) },
        },
      ],
    }).compile();
    const controller = moduleRef.get<HealthController>(HealthController);
    expect(controller).toBeDefined();
  });
});