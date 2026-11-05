import { Injectable } from '@nestjs/common';
import { v7 as uuidv7 } from 'uuid';

import { AddressesService } from '../addresses/addresses.service';
import { DomainError } from '../common/domain-error';
import { notifyCustomer } from '../customer/notify';
import { DatabaseService } from '../database/database.service';
import { assertIndianMobile } from '../identity/phone';

export type PartyStatus = 'new' | 'contacted' | 'confirmed' | 'cancelled';
export type PartyRequestView = {
  id: string; occasion: string; serviceSlug: string; guests: number; startsAt: string; addressLabel: string | null; status: PartyStatus; createdAt: string;
};
export type PartyInput = {
  occasion: 'birthday' | 'friends' | 'family' | 'team'; serviceSlug: string; guests: number; startsAt: string; addressId: string;
  contactPhone: string; contactName?: string | undefined; note?: string | undefined; idempotencyKey: string;
};
type Row = {
  id: string; occasion: string; service_slug: string; guests: number; starts_at: Date; address_label: string | null; address_line: string | null; address_area: string | null;
  contact_name: string | null; contact_phone: string | null; note: string | null; status: PartyStatus; admin_note: string | null; created_at: Date; handled_at: Date | null;
  customer?: string | null; handled_by_name?: string | null; user_id?: string;
};
const view = (r: Row): PartyRequestView => ({ id: r.id, occasion: r.occasion, serviceSlug: r.service_slug, guests: r.guests, startsAt: r.starts_at.toISOString(), addressLabel: r.address_label, status: r.status, createdAt: r.created_at.toISOString() });
const MIN_LEAD_MS = 24 * 3600_000;

@Injectable()
export class PartyService {
  constructor(private readonly db: DatabaseService, private readonly addresses: AddressesService) {}

  async submit(userId: string, input: PartyInput): Promise<PartyRequestView> {
    assertIndianMobile(input.contactPhone);
    const startsAt = new Date(input.startsAt);
    if (Number.isNaN(startsAt.getTime()) || startsAt.getTime() < Date.now() + MIN_LEAD_MS) {
      throw new DomainError('SLOT_UNAVAILABLE', 'Please pick a date at least a day from now.');
    }
    const row = await this.db.tx(async (client) => {
      const existing = await client.query<Row>(`select * from party_requests where user_id = $1 and idempotency_key = $2`, [userId, input.idempotencyKey]);
      if (existing.rows[0]) return existing.rows[0]; // same request sent twice: one request
      const service = await client.query(`select slug from services where slug = $1 and is_active`, [input.serviceSlug]);
      if (!service.rows[0]) throw new DomainError('NOT_FOUND', 'We could not find that activity.');
      const address = await this.addresses.findOwned(client, userId, input.addressId);
      if (!address) throw new DomainError('ADDRESS_NOT_FOUND', 'We could not find that address.');
      const id = uuidv7();
      const created = await client.query<Row>(
        `insert into party_requests (id, user_id, occasion, service_slug, guests, starts_at, address_id, address_label, address_line, address_area, address_pincode, contact_name, contact_phone, note, idempotency_key)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) returning *`,
        [id, userId, input.occasion, input.serviceSlug, input.guests, startsAt, address.id, address.label, address.line, address.area, address.pincode, input.contactName ?? null, input.contactPhone, input.note ?? null, input.idempotencyKey],
      );
      const name = input.contactName || (await client.query<{ email: string | null }>(`select email from users where id = $1`, [userId])).rows[0]?.email || 'A customer';
      await client.query(`insert into outbox_events (id, aggregate_type, aggregate_id, event_type, payload) values ($1, 'party_request', $2, 'party.requested', $3)`, [
        uuidv7(), id, JSON.stringify({ name, occasion: input.occasion, guests: input.guests, when: startsAt.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }), where: `${address.label}, ${address.area ?? ''}`.replace(/, $/, ''), phone: input.contactPhone }),
      ]);
      await notifyCustomer(client, userId, 'Party request received', 'Thanks! Our team will call you soon to confirm the details and the price.', null);
      return created.rows[0]!;
    });
    return view(row);
  }

  async mine(userId: string): Promise<PartyRequestView[]> {
    const r = await this.db.query<Row>(`select * from party_requests where user_id = $1 order by created_at desc limit 20`, [userId]);
    return r.rows.map(view);
  }

  // ---- ops ----
  async adminList(status?: PartyStatus) {
    const r = await this.db.query<Row>(
      `select p.*, coalesce(p.contact_name, u.full_name, u.email) as customer, hp.display_name as handled_by_name
         from party_requests p join users u on u.id = p.user_id left join admin_profiles hp on hp.user_id = p.handled_by
        where ($1::text is null or p.status = $1)
        order by (p.status = 'new') desc, p.starts_at limit 200`,
      [status ?? null],
    );
    return r.rows.map((x) => ({
      ...view(x), customer: x.customer ?? 'Customer', contactPhone: x.contact_phone, note: x.note, adminNote: x.admin_note,
      address: [x.address_label, x.address_line, x.address_area].filter(Boolean).join(', '), handledBy: x.handled_by_name ?? null, handledAt: x.handled_at?.toISOString() ?? null,
    }));
  }

  async setStatus(adminId: string, id: string, status: PartyStatus, adminNote?: string) {
    await this.db.tx(async (client) => {
      const cur = (await client.query<Row>(`select * from party_requests where id = $1 for update`, [id])).rows[0];
      if (!cur) throw new DomainError('NOT_FOUND', 'Party request not found.');
      await client.query(`update party_requests set status = $2, admin_note = coalesce($3, admin_note), handled_by = $4, handled_at = now() where id = $1`, [id, status, adminNote ?? null, adminId]);
      await client.query(`insert into audit_log (actor_user_id, action, entity_type, entity_id, before, after) values ($1, 'party.status', 'party_request', $2, $3, $4)`, [adminId, id, JSON.stringify({ status: cur.status }), JSON.stringify({ status, adminNote })]);
      if (status !== cur.status && (status === 'confirmed' || status === 'cancelled')) {
        await notifyCustomer(client, cur.user_id!, status === 'confirmed' ? 'Party confirmed' : 'Party request cancelled',
          status === 'confirmed' ? 'Your party is confirmed. Our team has the details.' : 'Your party request was cancelled. Contact us if this is a surprise.', null);
      }
    });
    return (await this.adminList()).find((x) => x.id === id);
  }
}
