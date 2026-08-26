import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/**
 * Every list endpoint is paginated. An unbounded list is a latent outage: it
 * works fine until one restaurant has 40,000 orders.
 *
 * `@Type(() => Number)` is required because the global pipe runs with
 * `enableImplicitConversion: false` — query strings arrive as text and are
 * converted explicitly, per field, rather than by a blanket guess.
 */
export class PaginationQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;

  @ApiPropertyOptional({ minimum: 0, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset: number = 0;
}
