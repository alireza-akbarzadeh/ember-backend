import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, Length } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.query.dto';
import { ToBoolean, TrimString } from '../../../common/transforms';

export class ListRestaurantsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ example: 'London' })
  @IsOptional()
  @IsString()
  @TrimString()
  @Length(2, 80)
  city?: string;

  @ApiPropertyOptional({ description: 'Only restaurants accepting orders' })
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  openOnly?: boolean;
}
