import { Injectable } from '@nestjs/common';

import { DomainError } from '../common/domain-error';
import { DatabaseService } from '../database/database.service';

export type AdminArea = {
  id: string; slug: string; name: string; city: string; status: 'active' | 'locked'; rolloutStage: number;
  activatedAt: string | null; pincodes: string[]; trainerCount: number;
};

const slugOf = (name: string): string => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50);

// Areas decide where customers can book. A customer's pincode must belong to an ACTIVE area, otherwise the address is
// "not serviceable". Trainers are alerted by pincode first, then by area. Nothing is deleted: an area is switched off,
// so old bookings keep their history. Switching an area off never cancels sessions that are already booked.
@Injectable()
export class AreasAdminService {
  constructor(private readonly db: DatabaseService) {}

  async list(): Promise<AdminArea[]> {
    const clusters = await this.db.query<{ id: string; slug: string; name: string; city: string; status: 'active' | 'locked'; rollout_stage: number; activated_at: Date | null }>(
      `select id, slug, name, city, status::text as status, rollout_stage, activated_at from clusters order by (status = 'active') desc, rollout_stage, name`,
    );
    const pins = await this.db.query<{ cluster_id: string; pincode: string }>(`select cluster_id, pincode from cluster_pincodes order by pincode`);
    const trainers = await this.db.query<{ cluster_id: string; n: string }>(
      `select cp.cluster_id, count(distinct t.user_id) as n
         from cluster_pincodes cp
         join trainer_applications ta on ta.address_pincode = cp.pincode
         join trainers t on t.application_id = ta.id and t.status = 'active'
        group by cp.cluster_id`,
    );
    const pinsBy = new Map<string, string[]>();
    for (const p of pins.rows) pinsBy.set(p.cluster_id, [...(pinsBy.get(p.cluster_id) ?? []), p.pincode]);
    const countBy = new Map(trainers.rows.map((r) => [r.cluster_id, Number(r.n)]));
    return clusters.rows.map((c) => ({
      id: c.id, slug: c.slug, name: c.name, city: c.city, status: c.status, rolloutStage: c.rollout_stage,
      activatedAt: c.activated_at ? c.activated_at.toISOString() : null,
      pincodes: pinsBy.get(c.id) ?? [], trainerCount: countBy.get(c.id) ?? 0,
    }));
  }

  async create(adminId: string, input: { name: string; city: string; pincodes: string[]; active: boolean }): Promise<{ id: string }> {
    const pincodes = [...new Set(input.pincodes)];
    const base = slugOf(input.name);
    if (base.length < 2) throw new DomainError('INVALID_REQUEST', 'Enter a name for the area.');
    return this.db.tx(async (client) => {
      for (const pin of pincodes) await this.assertFree(client, pin, null);
      let slug = base;
      for (let n = 2; (await client.query(`select 1 from clusters where slug = $1`, [slug])).rows[0]; n += 1) slug = `${base}-${n}`;
      const stage = await client.query<{ next: number }>(`select coalesce(max(rollout_stage), 0) + 1 as next from clusters`);
      const ins = await client.query<{ id: string }>(
        `insert into clusters (slug, name, city, rollout_stage, status, activated_at)
         values ($1, $2, $3, $4, $5::cluster_status, case when $5 = 'active' then now() end) returning id`,
        [slug, input.name, input.city, stage.rows[0]!.next, input.active ? 'active' : 'locked'],
      );
      const id = ins.rows[0]!.id;
      for (const pin of pincodes) await client.query(`insert into cluster_pincodes (cluster_id, pincode) values ($1, $2)`, [id, pin]);
      await client.query(`insert into audit_log (actor_user_id, action, entity_type, entity_id, after) values ($1, 'area.created', 'cluster', $2, $3)`, [adminId, id, JSON.stringify({ name: input.name, city: input.city, pincodes, active: input.active })]);
      return { id };
    });
  }

  async rename(adminId: string, id: string, name: string): Promise<void> {
    await this.db.tx(async (client) => {
      const upd = await client.query(`update clusters set name = $2, updated_at = now() where id = $1 returning id`, [id, name]);
      if (!upd.rows[0]) throw new DomainError('NOT_FOUND', 'We could not find that area.');
      await client.query(`insert into audit_log (actor_user_id, action, entity_type, entity_id, after) values ($1, 'area.renamed', 'cluster', $2, $3)`, [adminId, id, JSON.stringify({ name })]);
    });
  }

  async setStatus(adminId: string, id: string, active: boolean): Promise<void> {
    await this.db.tx(async (client) => {
      const upd = await client.query<{ status: string }>(
        `update clusters
            set status = $2::cluster_status,
                activated_at = case when $2 = 'active' and status <> 'active' then now() else activated_at end,
                updated_at = now()
          where id = $1 returning status::text as status`,
        [id, active ? 'active' : 'locked'],
      );
      if (!upd.rows[0]) throw new DomainError('NOT_FOUND', 'We could not find that area.');
      await client.query(`insert into audit_log (actor_user_id, action, entity_type, entity_id, after) values ($1, 'area.status_changed', 'cluster', $2, $3)`, [adminId, id, JSON.stringify({ active })]);
    });
  }

  async addPincode(adminId: string, id: string, pincode: string): Promise<void> {
    await this.db.tx(async (client) => {
      if (!(await client.query(`select 1 from clusters where id = $1`, [id])).rows[0]) throw new DomainError('NOT_FOUND', 'We could not find that area.');
      await this.assertFree(client, pincode, id);
      await client.query(`insert into cluster_pincodes (cluster_id, pincode) values ($1, $2) on conflict do nothing`, [id, pincode]);
      await client.query(`insert into audit_log (actor_user_id, action, entity_type, entity_id, after) values ($1, 'area.pincode_added', 'cluster', $2, $3)`, [adminId, id, JSON.stringify({ pincode })]);
    });
  }

  async removePincode(adminId: string, id: string, pincode: string): Promise<void> {
    await this.db.tx(async (client) => {
      const del = await client.query(`delete from cluster_pincodes where cluster_id = $1 and pincode = $2 returning pincode`, [id, pincode]);
      if (!del.rows[0]) throw new DomainError('NOT_FOUND', 'That pincode is not in this area.');
      await client.query(`insert into audit_log (actor_user_id, action, entity_type, entity_id, after) values ($1, 'area.pincode_removed', 'cluster', $2, $3)`, [adminId, id, JSON.stringify({ pincode })]);
    });
  }

  // A pincode belongs to one area, so it is always clear which area serves a customer.
  private async assertFree(client: import('pg').PoolClient, pincode: string, ownId: string | null): Promise<void> {
    const taken = await client.query<{ name: string; id: string }>(
      `select c.id, c.name from cluster_pincodes cp join clusters c on c.id = cp.cluster_id where cp.pincode = $1`, [pincode],
    );
    const other = taken.rows.find((r) => r.id !== ownId);
    if (other) throw new DomainError('INVALID_REQUEST', `Pincode ${pincode} is already in "${other.name}". Remove it there first.`);
  }
}
