import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.query.dto';
import { orderStatus, type OrderStatus } from '../../../database/schema/orders';

export class ListOrdersQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: orderStatus.enumValues })
  @IsOptional()
  @IsIn(orderStatus.enumValues)
  status?: OrderStatus;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Restaurant to filter by. Only usable by that restaurant’s owner.',
  })
  @IsOptional()
  @IsUUID()
  restaurantId?: string;
}
