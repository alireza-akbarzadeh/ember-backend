import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

export class ListMenuItemsQueryDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Restrict to one menu section',
  })
  @IsOptional()
  @IsUUID()
  categoryId?: string;
}
