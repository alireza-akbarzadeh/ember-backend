import { Injectable, NotFoundException } from '@nestjs/common';
import type { Address } from '../../database/schema/addresses';
import type { AuthenticatedUser } from '../auth/auth.types';
import { AddressesRepository } from './addresses.repository';
import { AddressResponseDto } from './dto/address-response.dto';
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';

@Injectable()
export class AddressesService {
  constructor(private readonly addresses: AddressesRepository) {}

  async create(user: AuthenticatedUser, dto: CreateAddressDto): Promise<AddressResponseDto> {
    // The first address a user saves becomes their default whether they asked
    // or not — otherwise nearby search silently does nothing until they notice
    // a toggle they were never shown.
    const existing = await this.addresses.countForUser(user.id);

    const address = await this.addresses.insert({
      ...dto,
      userId: user.id,
      isDefault: dto.isDefault ?? existing === 0,
    });

    return AddressResponseDto.from(address);
  }

  async list(user: AuthenticatedUser): Promise<AddressResponseDto[]> {
    const rows = await this.addresses.findByUser(user.id);
    return rows.map((row) => AddressResponseDto.from(row));
  }

  async update(
    user: AuthenticatedUser,
    id: string,
    dto: UpdateAddressDto,
  ): Promise<AddressResponseDto> {
    await this.requireOwned(id, user);

    const address = await this.addresses.update(id, user.id, dto);
    if (!address) throw new NotFoundException('Address not found');

    return AddressResponseDto.from(address);
  }

  async remove(user: AuthenticatedUser, id: string): Promise<void> {
    const address = await this.requireOwned(id, user);

    await this.addresses.delete(id);

    // Deleting the default leaves the user with none, so promote another.
    if (address.isDefault) {
      const [next] = await this.addresses.findByUser(user.id);
      if (next) await this.addresses.update(next.id, user.id, { isDefault: true });
    }
  }

  /** The origin for nearby search, or null when the user has saved none. */
  findDefault(userId: string): Promise<Address | null> {
    return this.addresses.findDefaultForUser(userId);
  }

  /**
   * 404 rather than 403 for someone else's address: confirming that an id
   * exists tells a stranger something they should not learn from guessing.
   */
  private async requireOwned(id: string, user: AuthenticatedUser): Promise<Address> {
    const address = await this.addresses.findById(id);

    if (!address || (address.userId !== user.id && user.role !== 'admin')) {
      throw new NotFoundException('Address not found');
    }

    return address;
  }
}
