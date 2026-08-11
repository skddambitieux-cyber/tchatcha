import { Controller, Get, Query } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsOptional, IsString, Length } from 'class-validator';
import { Repository } from 'typeorm';
import { Category } from '../../domain/entities/category.entity';

class CategoriesQueryDto {
  @IsOptional()
  @IsString()
  @Length(2, 2)
  country_code = 'BJ';
}

@Controller('categories')
export class CategoriesController {
  constructor(
    @InjectRepository(Category) private readonly categories: Repository<Category>,
  ) {}

  @Get()
  async list(@Query() query: CategoriesQueryDto) {
    const items = await this.categories.find({
      select: {
        id: true,
        parent_id: true,
        country_code: true,
        name: true,
        slug: true,
        icon_url: true,
        sort_order: true,
        translations: true,
      },
      where: {
        country_code: query.country_code.toUpperCase(),
        active: true,
        deleted_at: null,
      },
      order: { sort_order: 'ASC', name: 'ASC' },
    });
    return { items };
  }
}
