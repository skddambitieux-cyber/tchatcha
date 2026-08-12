import { Type } from 'class-transformer';
import { IsInt, IsNumber, IsOptional, IsString, Length, Max, Min } from 'class-validator';

export class CreateQuoteDto {
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(1) @Max(999999999999.99)
  price: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(365)
  duration_days?: number;

  @IsOptional() @IsString() @Length(1, 2000)
  message?: string;
}
