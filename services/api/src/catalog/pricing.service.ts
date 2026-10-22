import { Injectable } from '@nestjs/common';

export type BookingMode = 'instant' | 'scheduled' | 'demo';
export const BOOKING_MODES: BookingMode[] = ['instant', 'scheduled', 'demo'];
type Queryable = { query: (text: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> };

// Prices are records (decision D13). A price set for one service wins over the default price for all services.
@Injectable()
export class PricingService {
  async priceFor(db: Queryable, serviceId: string, mode: BookingMode): Promise<number | null> {
    const result = await db.query(
      `select price_paise from service_prices
        where is_active and mode = $2::booking_mode and (service_id = $1 or service_id is null)
        order by (service_id is null)
        limit 1`,
      [serviceId, mode],
    );
    const row = result.rows[0];
    return row ? Number(row.price_paise) : null;
  }
}
