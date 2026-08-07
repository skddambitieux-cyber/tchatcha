/**
 * TCHATCHA — Controller auth : POST /api/v1/auth/otp/request
 * (contrat : docs/27-api-contracts-auth.md §2).
 */
import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import {
  RequestOtpDto,
} from './dto/request-otp.dto';
import { OtpService } from '../../application/services/otp.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly otpService: OtpService) {}

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
}
