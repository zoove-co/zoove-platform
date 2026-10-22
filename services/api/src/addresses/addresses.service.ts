import { Injectable } from '@nestjs/common';
import type { PoolClient, QueryResult, QueryResultRow } from 'pg';
import { v7 as uuidv7 } from 'uuid';

import { lockFor } from '../common/locks';
import { DomainError } from '../common/domain-error';
import { DatabaseService } from '../database/database.service';

export type Address = {
  id: string;
  label: string;
  line: string;
  area: string;
  pincode: string;
  isDefault: boolean;
  latitude: number | null;
  longitude: number | null;
  serviceable: boolean;
};

export type NewAddress = {
  label: string;
  line: string;
  area: string;
  pincode: string;
  latitude?: number;
  longitude?: number;
};

type Runner = { query<T extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]): Promise<QueryResult<T>> };

type Row = {
  id: string;
  label: string;
  line1: string;
  locality: string | null;
  pincode: string | null;
  is_default: boolean;
  latitude: number | null;
  longitude: number | null;
  serviceable: boolean;
};

// Serviceability today: the pincode belongs to an active cluster. Polygon checks arrive with cluster boundaries.
const SERVICEABLE_SQL = `exists (select 1 from cluster_pincodes cp join clusters c on c.id = cp.cluster_id
                                   where cp.pincode = a.pincode and c.status = 'active')`;
const SELECT = `select a.id, a.label, a.line1, a.locality, a.pincode, a.is_default, a.latitude, a.longitude,
                       ${SERVICEABLE_SQL} as serviceable
                  from addresses a`;

const toAddress = (row: Row): Address => ({
  id: row.id,
  label: row.label,
  line: row.line1,
  area: row.locality ?? '',
  pincode: row.pincode ?? '',
  isDefault: row.is_default,
  latitude: row.latitude,
  longitude: row.longitude,
  serviceable: row.serviceable,
});

@Injectable()
export class AddressesService {
  constructor(private readonly db: DatabaseService) {}

  async list(userId: string): Promise<Address[]> {
    return this.listWith(this.db, userId);
  }

  async isServiceable(pincode: string): Promise<boolean> {
    const result = await this.db.query<{ ok: boolean }>(
      `select exists (select 1 from cluster_pincodes cp join clusters c on c.id = cp.cluster_id
                       where cp.pincode = $1 and c.status = 'active') as ok`,
      [pincode],
    );
    return result.rows[0]?.ok ?? false;
  }

  async add(userId: string, input: NewAddress): Promise<Address> {
    return this.db.tx(async (client) => {
      await lockFor(client, 'address', userId);
      // The same address typed twice is one address.
      const existing = await client.query<Row>(
        `${SELECT} where a.user_id = $1 and a.deleted_at is null and lower(a.line1) = lower($2) and a.pincode = $3`,
        [userId, input.line, input.pincode],
      );
      if (existing.rows[0]) return toAddress(existing.rows[0]);

      const id = uuidv7();
      await client.query(
        `insert into addresses (id, user_id, label, line1, locality, pincode, latitude, longitude, is_default)
         values ($1, $2, $3, $4, $5, $6, $7, $8,
                 not exists (select 1 from addresses where user_id = $2 and deleted_at is null))`,
        [id, userId, input.label, input.line, input.area, input.pincode, input.latitude ?? null, input.longitude ?? null],
      );
      const created = await client.query<Row>(`${SELECT} where a.id = $1`, [id]);
      return toAddress(created.rows[0] as Row);
    });
  }

  // For the booking module: one of the customer's own addresses, or null.
  async findOwned(runner: Runner, userId: string, id: string): Promise<Address | null> {
    const result = await runner.query<Row>(`${SELECT} where a.id = $1 and a.user_id = $2 and a.deleted_at is null`, [id, userId]);
    return result.rows[0] ? toAddress(result.rows[0]) : null;
  }

  async setDefault(userId: string, id: string): Promise<Address[]> {
    return this.db.tx(async (client) => {
      await lockFor(client, 'address', userId);
      await this.mustOwn(client, userId, id);
      await client.query(`update addresses set is_default = false where user_id = $1 and is_default`, [userId]);
      await client.query(`update addresses set is_default = true where id = $1`, [id]);
      return this.listWith(client, userId);
    });
  }

  async remove(userId: string, id: string): Promise<Address[]> {
    return this.db.tx(async (client) => {
      await lockFor(client, 'address', userId);
      const address = await this.mustOwn(client, userId, id);
      const inUse = await client.query(
        `select 1 from bookings where address_id = $1 and status in ('matching', 'confirmed', 'rematching') limit 1`,
        [id],
      );
      if (inUse.rows[0]) {
        throw new DomainError('ADDRESS_IN_USE', 'This address has an upcoming session. Cancel or move it first.');
      }
      await client.query(`update addresses set deleted_at = now(), is_default = false where id = $1`, [id]);
      if (address.is_default) {
        // Never leave a customer with addresses but no default.
        await client.query(
          `update addresses set is_default = true
            where id = (select id from addresses where user_id = $1 and deleted_at is null
                         order by created_at desc limit 1)`,
          [userId],
        );
      }
      return this.listWith(client, userId);
    });
  }

  private async listWith(runner: Runner, userId: string): Promise<Address[]> {
    const result = await runner.query<Row>(
      `${SELECT} where a.user_id = $1 and a.deleted_at is null order by a.is_default desc, a.created_at desc`,
      [userId],
    );
    return result.rows.map(toAddress);
  }

  private async mustOwn(client: PoolClient, userId: string, id: string): Promise<{ is_default: boolean }> {
    const result = await client.query<{ is_default: boolean }>(
      `select is_default from addresses where id = $1 and user_id = $2 and deleted_at is null for update`,
      [id, userId],
    );
    const row = result.rows[0];
    if (!row) throw new DomainError('ADDRESS_NOT_FOUND', 'We could not find that address.');
    return row;
  }
}
