/**
 * TCHATCHA — Controller vitrine professionnelle (6.3.3 + 6.3.4, docs/35 §3,
 * docs/36 §5.3). Lecture GET /professionals/me + écritures : PUT me, CRUD
 * services, PUT business_hours (remplacement atomique), PUT location (upsert).
 * AuthGuard/@CurrentUser depuis le module auth (D-ME-3), AuthModule exporté.
 * Réponses : 200/201 / 401 / 403 / 404 / 409 version_conflict / 422.
 */
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../../../auth/interface/http/guards/auth.guard';
import { CurrentUser } from '../../../auth/interface/http/decorators/current-user.decorator';
import { Query } from '@nestjs/common';
import { UserNotFoundError } from '../../../auth/domain/errors/auth-errors';
import { ProfessionalShowcaseService } from '../../application/services/professional-showcase.service';
import { UpdateShowcaseDto } from './dto/update-showcase.dto';
import { ServiceDto } from './dto/service.dto';
import { DeleteServiceDto } from './dto/delete-service.dto';
import { BusinessHoursDto } from './dto/business-hours.dto';
import { LocationDto } from './dto/location.dto';
import {
  ConfirmPortfolioDto,
  PortfolioQueryDto,
  UpdatePortfolioDto,
} from './dto/portfolio.dto';

@Controller('professionals')
export class ProfessionalsController {
  constructor(
    private readonly showcaseService: ProfessionalShowcaseService,
  ) {}

  @Get('me')
  @UseGuards(AuthGuard)
  getMe(@CurrentUser() userId?: string) {
    if (!userId) {
      throw new UserNotFoundError();
    }
    return this.showcaseService.getMe(userId);
  }

  /** PUT /professionals/me — remplacement total de la vitrine (36 RF-PW-W04). */
  @Put('me')
  @UseGuards(AuthGuard)
  updateMe(@CurrentUser() userId?: string, @Body() dto: UpdateShowcaseDto) {
    if (!userId) {
      throw new UserNotFoundError();
    }
    return this.showcaseService.updateMe(userId, {
      businessName: dto.business_name,
      headline: dto.headline,
      description: dto.description,
      experienceYears: dto.experience_years,
      employeesCount: dto.employees_count,
      minPrice: dto.min_price,
      website: dto.website,
      socialLinks: dto.social_links,
      expectedVersion: dto.version,
    });
  }

  /** POST /professionals/me/services — création (36 RF-PW-W05, 201). */
  @Post('me/services')
  @UseGuards(AuthGuard)
  createService(@CurrentUser() userId?: string, @Body() dto: ServiceDto) {
    if (!userId) {
      throw new UserNotFoundError();
    }
    return this.showcaseService.createService(userId, this.toServiceCommand(dto));
  }

  /** PUT /professionals/me/services/:id — remplacement (36 RF-PW-W05). */
  @Put('me/services/:id')
  @UseGuards(AuthGuard)
  updateService(
    @CurrentUser() userId?: string,
    @Param('id') id?: string,
    @Body() dto: ServiceDto = new ServiceDto(),
  ) {
    if (!userId) {
      throw new UserNotFoundError();
    }
    if (!id) {
      throw new UserNotFoundError();
    }
    return this.showcaseService.updateService(userId, id, this.toServiceCommand(dto));
  }

  /** DELETE /professionals/me/services/:id — sans promotion (36 RF-PW-W06b). */
  @Delete('me/services/:id')
  @UseGuards(AuthGuard)
  deleteService(
    @CurrentUser() userId?: string,
    @Param('id') id?: string,
    @Body() dto: DeleteServiceDto = new DeleteServiceDto(),
  ) {
    if (!userId) {
      throw new UserNotFoundError();
    }
    if (!id) {
      throw new UserNotFoundError();
    }
    return this.showcaseService.deleteService(userId, id, dto.version);
  }

  /** PUT /professionals/me/business_hours — remplacement atomique (W08). */
  @Put('me/business_hours')
  @UseGuards(AuthGuard)
  replaceBusinessHours(
    @CurrentUser() userId?: string,
    @Body() dto: BusinessHoursDto = new BusinessHoursDto(),
  ) {
    if (!userId) {
      throw new UserNotFoundError();
    }
    return this.showcaseService.replaceBusinessHours(
      userId,
      dto.hours.map((h) => ({
        weekday: h.weekday,
        openAt: h.open_at,
        closeAt: h.close_at,
        closed: h.closed ?? false,
      })),
      dto.version,
    );
  }

  /** PUT /professionals/me/location — upsert 1:1 (36 RF-PW-W09). */
  @Put('me/location')
  @UseGuards(AuthGuard)
  upsertLocation(
    @CurrentUser() userId?: string,
    @Body() dto: LocationDto = new LocationDto(),
  ) {
    if (!userId) {
      throw new UserNotFoundError();
    }
    return this.showcaseService.upsertLocation(userId, {
      lat: dto.lat,
      lon: dto.lon,
      divisionId: dto.division_id,
      serviceRadiusKm: dto.service_radius_km,
      addressText: dto.address_text,
      expectedVersion: dto.version,
    });
  }

  /** POST /professionals/me/portfolio/:id/confirm — READY (37 RF-PW-P01, 200). */
  @Post('me/portfolio/:id/confirm')
  @HttpCode(200)
  @UseGuards(AuthGuard)
  confirmPortfolio(
    @CurrentUser() userId?: string,
    @Param('id') id?: string,
    @Body() dto: ConfirmPortfolioDto = new ConfirmPortfolioDto(),
  ) {
    if (!userId || !id) {
      throw new UserNotFoundError();
    }
    return this.showcaseService.confirmPortfolio(userId, id, dto.version);
  }

  /** PUT /professionals/me/portfolio/:id — reorder/purpose (37 RF-PW-P02). */
  @Put('me/portfolio/:id')
  @UseGuards(AuthGuard)
  updatePortfolio(
    @CurrentUser() userId?: string,
    @Param('id') id?: string,
    @Body() dto: UpdatePortfolioDto = new UpdatePortfolioDto(),
  ) {
    if (!userId || !id) {
      throw new UserNotFoundError();
    }
    return this.showcaseService.updatePortfolio(userId, id, {
      purpose: dto.purpose,
      sortOrder: dto.sort_order,
      expectedVersion: dto.version,
    });
  }

  /** DELETE /professionals/me/portfolio/:id — soft + objet S3 (37 RF-PW-P03). */
  @Delete('me/portfolio/:id')
  @UseGuards(AuthGuard)
  deletePortfolio(
    @CurrentUser() userId?: string,
    @Param('id') id?: string,
    @Body() dto: ConfirmPortfolioDto = new ConfirmPortfolioDto(),
  ) {
    if (!userId || !id) {
      throw new UserNotFoundError();
    }
    return this.showcaseService.deletePortfolio(userId, id, dto.version);
  }

  /** GET /professionals/me/portfolio — pagination offset (37 RF-PW-P04). */
  @Get('me/portfolio')
  @UseGuards(AuthGuard)
  listPortfolio(
    @CurrentUser() userId?: string,
    @Query() query: PortfolioQueryDto = new PortfolioQueryDto(),
  ) {
    if (!userId) {
      throw new UserNotFoundError();
    }
    return this.showcaseService.listPortfolio(userId, query.page, query.limit);
  }

  private toServiceCommand(dto: ServiceDto) {
    return {
      categoryId: dto.category_id,
      title: dto.title,
      description: dto.description,
      priceFrom: dto.price_from,
      priceTo: dto.price_to,
      priceUnit: dto.price_unit,
      isPrimary: dto.is_primary,
      sortOrder: dto.sort_order,
      expectedVersion: dto.version,
    };
  }
}
