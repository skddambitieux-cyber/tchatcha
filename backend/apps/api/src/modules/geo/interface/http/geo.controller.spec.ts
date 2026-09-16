import { NotFoundException } from '@nestjs/common';
import type { Repository } from 'typeorm';
import { Division } from '../../domain/entities/geo.entity';
import { GeoController } from './geo.controller';

describe('GeoController localities', () => {
  const countries = {} as Repository<unknown>;
  let divisions: jest.Mocked<Repository<Division>>;
  let controller: GeoController;

  beforeEach(() => {
    divisions = {
      findOne: jest.fn(),
      find: jest.fn(),
    } as unknown as jest.Mocked<Repository<Division>>;
    controller = new GeoController(countries as never, divisions);
  });

  it('retourne uniquement id/name dans un ordre stable', async () => {
    divisions.findOne.mockResolvedValue({ id: 'parent' } as Division);
    divisions.find.mockResolvedValue([
      { id: 'b', name: 'Calavi' },
      { id: 'a', name: 'Cotonou' },
    ] as Division[]);

    const result = await controller.listLocalities('parent');

    expect(result).toEqual({ items: [
      { id: 'b', name: 'Calavi' },
      { id: 'a', name: 'Cotonou' },
    ] });
    expect(result.items.every((item) => Object.keys(item).sort().join(',') === 'id,name')).toBe(true);
    expect(divisions.find).toHaveBeenCalledWith({
      select: { id: true, name: true },
      where: { parent_id: 'parent', active: true },
      order: { name: 'ASC', id: 'ASC' },
    });
  });

  it('retourne une liste vide sans donnée supplémentaire', async () => {
    divisions.findOne.mockResolvedValue({ id: 'parent' } as Division);
    divisions.find.mockResolvedValue([]);

    await expect(controller.listLocalities('parent')).resolves.toEqual({ items: [] });
  });

  it('propage division absente ou inactive en NotFoundException', async () => {
    divisions.findOne.mockResolvedValue(null);

    await expect(controller.listLocalities('inactive-or-missing'))
      .rejects.toBeInstanceOf(NotFoundException);
    expect(divisions.find).not.toHaveBeenCalled();
  });
});
