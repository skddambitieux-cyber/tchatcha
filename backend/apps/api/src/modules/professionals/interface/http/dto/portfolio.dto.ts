/**
 * TCHATCHA — DTOs portfolio (37 §3.2, RF-PW-P01/P02/P04).
 * Confirm/Delete : corps portant uniquement `version` (verrou RF-PW-W04b).
 * Update : version + sort_order (int ≥ 0) et/ou purpose (PORTFOLIO/BEFORE_AFTER).
 * GET /portfolio : pagination offset page/limit (limit ≤ 100, défaut 50).
 */
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';

export const PORTFOLIO_PURPOSES = ['PORTFOLIO', 'BEFORE_AFTER'] as const;

export class ConfirmPortfolioDto {
  @IsInt()
  @Min(1)
  version: number;
}

export class UpdatePortfolioDto {
  @IsInt()
  @Min(1)
  version: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  sort_order?: number;

  @IsOptional()
  @IsIn(PORTFOLIO_PURPOSES)
  purpose?: (typeof PORTFOLIO_PURPOSES)[number];
}

export class PortfolioQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 50;
}
