import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayUnique, IsArray, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class CreateReviewDto {
  @IsUUID('4') booking_id!: string;
  @IsInt() @Min(1) @Max(5) @Type(() => Number) rating!: number;
  @IsInt() @Min(1) @Max(5) @Type(() => Number) punctuality!: number;
  @IsInt() @Min(1) @Max(5) @Type(() => Number) quality!: number;
  @IsInt() @Min(1) @Max(5) @Type(() => Number) price_ratio!: number;
  @IsInt() @Min(1) @Max(5) @Type(() => Number) politeness!: number;
  @IsOptional() @IsString() @MaxLength(1000) comment?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(5) @ArrayUnique() @IsUUID('4', { each: true }) @Type(() => String) media_ids?: string[];
}

export interface ReviewView {
  id: string; booking_id: string; rating: number; punctuality: number; quality: number;
  price_ratio: number; politeness: number; comment: string | null;
  media_ids: string[]; is_late: boolean; status: string;
  created_at: string; updated_at: string;
}

export interface ReviewListView {
  data: Array<Omit<ReviewView, 'booking_id' | 'status' | 'updated_at'>>;
  pagination: { next_cursor: string | null; has_more: boolean; total_estimate: null };
  averages: { rating: number | null; punctuality: number | null; quality: number | null; price_ratio: number | null; politeness: number | null; count: number };
}
