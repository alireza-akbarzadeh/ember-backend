import { ApiProperty } from '@nestjs/swagger';

/**
 * The envelope every list endpoint returns.
 *
 * A bare array cannot tell a client whether there is a next page, so the UI
 * either guesses from `length === limit` (wrong exactly when the last page is
 * full) or fetches again to find out. `total` costs one extra COUNT and
 * removes the guesswork.
 */
export class PaginatedDto<T> {
  @ApiProperty({ isArray: true })
  items: T[];

  @ApiProperty({ description: 'Rows matching the filters, ignoring pagination' })
  total: number;

  @ApiProperty()
  limit: number;

  @ApiProperty()
  offset: number;

  @ApiProperty({ description: 'Whether another page exists after this one' })
  hasMore: boolean;
}

export function paginate<T>(
  items: T[],
  total: number,
  limit: number,
  offset: number,
): PaginatedDto<T> {
  return {
    items,
    total,
    limit,
    offset,
    hasMore: offset + items.length < total,
  };
}
