import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsUUID, Min } from 'class-validator';
export class ListSlotsDto {
  @IsDateString() from: string;
  @IsDateString() to: string;
}
export class CreateBookingDto {
  @IsUUID() quote_id: string;
  @IsUUID() slot_id: string;
  @Type(() => Number) @IsInt() @Min(1) slot_version: number;
  @Type(() => Number) @IsInt() @Min(1) quote_version: number;
  @Type(() => Number) @IsInt() @Min(1) request_version: number;
}
