import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class AdminVerificationQueryDto {
  @IsOptional() @IsIn(['PENDING', 'APPROVED', 'REJECTED']) status = 'PENDING';
  @IsOptional() @Transform(({ value }) => Number(value)) @IsInt() @Min(1) page = 1;
  @IsOptional() @Transform(({ value }) => Number(value)) @IsInt() @Min(1) @Max(100) limit = 50;
}

export class DecideVerificationDto {
  @IsBoolean() approve: boolean;
  @IsOptional() @IsString() reason?: string;
}
