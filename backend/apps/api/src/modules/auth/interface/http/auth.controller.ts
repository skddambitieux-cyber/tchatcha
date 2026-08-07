/**
 * TCHATCHA — Controller auth : otp/request, otp/verify, login, register
 * (contrats : docs/27-api-contracts-auth.md §2–§5).
 */
import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Post,
  Req,
} from '@nestjs/common';
import { RequestOtpDto } from './dto/request-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { OtpPurpose } from '../../domain/entities/otp-code.entity';
import { OtpService } from '../../application/services/otp.service';
import { LoginService } from '../../application/services/login.service';
import { ProfileService } from '../../application/services/profile.service';
import { DeviceInfo } from '../../application/types/auth.types';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly otpService: OtpService,
    private readonly loginService: LoginService,
    private readonly profileService: ProfileService,
  ) {}

  @Post('otp/request')
  @HttpCode(202)
  async requestOtp(@Body() dto: RequestOtpDto) {
    const result = await this.otpService.request({
      countryCode: dto.country_code,
      phone: dto.phone,
      purpose: dto.purpose,
      device: dto.device,
    });
    return {
      message: 'otp_sent',
      retry_after: result.retryAfterSeconds,
      expires_at: result.expiresAt.toISOString(),
    };
  }

  @Post('otp/verify')
  @HttpCode(200)
  async verifyOtp(@Body() dto: VerifyOtpDto, @Req() req: Request) {
    if (dto.purpose === OtpPurpose.LOGIN) {
      // LOGIN : valide le code ET délivre la session (27 §3, 28 §3).
      const result = await this.loginService.login({
        countryCode: dto.country_code,
        phone: dto.phone,
        code: dto.code,
        device: this.buildDevice(dto.device, req),
      });
      return { ...result.tokens, user: result.user };
    }
    const result = await this.otpService.verify({
      countryCode: dto.country_code,
      phone: dto.phone,
      code: dto.code,
      purpose: dto.purpose,
      device: dto.device,
    });
    return { status: result.status };
  }

  @Post('login')
  @HttpCode(200)
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Headers('user-agent') userAgent?: string,
  ) {
    const result = await this.loginService.login({
      countryCode: dto.country_code,
      phone: dto.phone,
      code: dto.code,
      device: this.buildDevice(dto.device, req, userAgent),
    });
    return { ...result.tokens, user: result.user };
  }

  @Post('register')
  @HttpCode(201)
  async register(
    @Body() dto: RegisterDto,
    @Req() req: Request,
    @Headers('user-agent') userAgent?: string,
  ) {
    const result = await this.profileService.completeRegistration({
      countryCode: dto.country_code,
      phone: dto.phone,
      fullName: dto.full_name,
      role: dto.role,
      consents: dto.consents,
      categoryId: dto.category_id,
      divisionId: dto.division_id,
      localityId: dto.locality_id,
      deliveryZone: dto.delivery_zone,
      deliveryMeans: dto.delivery_means,
      device: this.buildDevice(dto.device, req, userAgent),
    });
    return {
      ...result.tokens,
      user: result.user,
    };
  }

  private buildDevice(
    device: { session_id?: string; user_agent?: string; ip?: string } | undefined,
    req: Request,
    userAgent?: string,
  ): DeviceInfo {
    const ip =
      (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ??
      (req as Request & { ip?: string }).ip ??
      '0.0.0.0';
    return {
      session_id: device?.session_id ?? 'unknown',
      user_agent: device?.user_agent ?? userAgent ?? null,
      ip,
    };
  }
}