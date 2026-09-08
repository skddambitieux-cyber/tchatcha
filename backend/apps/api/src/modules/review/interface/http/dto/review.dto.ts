import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayUnique, IsArray, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

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

export class UpdateReviewDto {
  @IsInt() @Min(1) @Max(5) @Type(() => Number) rating!: number;
  @IsInt() @Min(1) @Max(5) @Type(() => Number) punctuality!: number;
  @IsInt() @Min(1) @Max(5) @Type(() => Number) quality!: number;
  @IsInt() @Min(1) @Max(5) @Type(() => Number) price_ratio!: number;
  @IsInt() @Min(1) @Max(5) @Type(() => Number) politeness!: number;
  @IsOptional() @IsString() @MaxLength(1000) comment?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(5) @ArrayUnique() @IsUUID('4', { each: true }) @Type(() => String) media_ids?: string[];
}

export class RespondReviewDto {
  @IsString() @IsNotEmpty() @MaxLength(500) body!: string;
}

export class ReportReviewDto {
  @IsString() @IsIn(['SPAM','HARASSMENT','HATE_OR_DISCRIMINATION','PERSONAL_DATA','FRAUD','IRRELEVANT','OTHER']) reason!: string;
  @IsOptional() @IsString() @MaxLength(500) comment?: string;
}

export class ModerateReviewDto {
  @IsString() @IsIn(['HIDE','RESTORE']) decision!: 'HIDE' | 'RESTORE';
  @IsString() @IsNotEmpty() @MaxLength(1000) reason!: string;
}

export interface ReviewView {
  id: string; booking_id: string; rating: number; punctuality: number; quality: number;
  price_ratio: number; politeness: number; comment: string | null;
  media_ids: string[]; is_late: boolean; status: string;
  created_at: string; updated_at: string;
}

export interface ReviewResponseView {
  id: string; review_id: string; professional_id?: string; body: string; created_at: string;
}

export interface ReviewListView {
  data: Array<Omit<ReviewView, 'booking_id' | 'status' | 'updated_at'> & { response: ReviewResponseView | null }>;
  pagination: { next_cursor: string | null; has_more: boolean; total_estimate: null };
  averages: { rating: number | null; punctuality: number | null; quality: number | null; price_ratio: number | null; politeness: number | null; count: number };
}
