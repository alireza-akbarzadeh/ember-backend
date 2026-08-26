import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';
import { TrimString } from '../../../common/transforms';

export class CreateMenuCategoryDto {
  @ApiProperty({ example: 'Burgers', minLength: 2, maxLength: 80 })
  @IsString()
  @TrimString()
  @Length(2, 80)
  name: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @TrimString()
  @Length(0, 500)
  description?: string;

  @ApiPropertyOptional({
    description: 'Lower values appear first; ties break on name',
    default: 0,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  sortOrder?: number;
}
