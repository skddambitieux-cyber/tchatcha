import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsIn, IsOptional } from 'class-validator';
import { Repository } from 'typeorm';
import { Country, Division } from '../../domain/entities/geo.entity';

class DivisionsQueryDto {
  @IsOptional()
  @IsIn(['DEPARTMENT', 'COMMUNE'])
  type?: string;
}

@Controller('geo')
export class GeoController {
  constructor(
    @InjectRepository(Country) private readonly countries: Repository<Country>,
    @InjectRepository(Division) private readonly divisions: Repository<Division>,
  ) {}

  @Get('countries')
  async listCountries() {
    const items = await this.countries.find({
      select: {
        code: true,
        name: true,
        name_translations: true,
        currency: true,
        phone_code: true,
        locale_default: true,
      },
      where: { active: true },
      order: { name: 'ASC' },
    });
    return { items };
  }

  @Get('countries/:code/divisions')
  async listDivisions(
    @Param('code') rawCode: string,
    @Query() query: DivisionsQueryDto,
  ) {
    const code = rawCode.toUpperCase();
    const country = await this.countries.findOneBy({ code, active: true });
    if (!country) {
      throw new NotFoundException({ code: 'country_not_found' });
    }
    const items = await this.divisions.find({
      select: {
        id: true,
        country_code: true,
        parent_id: true,
        type: true,
        name: true,
        name_translations: true,
        depth: true,
      },
      where: {
        country_code: code,
        active: true,
        ...(query.type ? { type: query.type } : {}),
      },
      order: { depth: 'ASC', name: 'ASC' },
    });
    return { items };
  }
}
