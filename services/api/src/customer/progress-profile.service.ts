import { Injectable } from '@nestjs/common';

import { DomainError } from '../common/domain-error';
import { DatabaseService } from '../database/database.service';
import { TERMS_VERSION } from '../identity/consent';

export type ProgressProfile = {
  goal: string | null; targetDaysPerWeek: number | null; heightCm: number | null; weightKg: number | null; healthConsent: boolean;
};
export type ProgressProfileInput = {
  goal?: string | null | undefined; targetDaysPerWeek?: number | null | undefined; heightCm?: number | null | undefined; weightKg?: number | null | undefined; healthConsent: boolean;
};
type Row = { goals: string[]; target_days_per_week: number | null; height_cm: number | null; weight_kg: string | null };

// Goal and days a week are ordinary; height and weight are health data and are kept only while the customer has said yes.
@Injectable()
export class ProgressProfileService {
  constructor(private readonly db: DatabaseService) {}

  async get(userId: string): Promise<ProgressProfile> {
    const [p, c] = await Promise.all([
      this.db.query<Row>(`select goals, target_days_per_week, height_cm, weight_kg from customer_profiles where user_id = $1`, [userId]),
      this.db.query<{ accepted: boolean }>(`select accepted from consents where user_id = $1 and kind = 'health_data' order by recorded_at desc limit 1`, [userId]),
    ]);
    const consent = c.rows[0]?.accepted === true;
    const row = p.rows[0];
    return {
      goal: row?.goals[0] ?? null, targetDaysPerWeek: row?.target_days_per_week ?? null,
      heightCm: consent ? row?.height_cm ?? null : null, weightKg: consent && row?.weight_kg != null ? Number(row.weight_kg) : null, healthConsent: consent,
    };
  }

  async save(userId: string, input: ProgressProfileInput): Promise<ProgressProfile> {
    const wantsBody = input.heightCm != null || input.weightKg != null;
    if (wantsBody && !input.healthConsent) throw new DomainError('CONSENT_REQUIRED', 'Please agree to us keeping your height and weight, or leave them blank.');
    await this.db.tx(async (client) => {
      const last = (await client.query<{ accepted: boolean }>(`select accepted from consents where user_id = $1 and kind = 'health_data' order by recorded_at desc limit 1`, [userId])).rows[0];
      if ((last?.accepted ?? false) !== input.healthConsent) {
        await client.query(`insert into consents (user_id, kind, version, accepted) values ($1, 'health_data', $2, $3)`, [userId, TERMS_VERSION, input.healthConsent]);
      }
      const height = input.healthConsent ? input.heightCm ?? null : null;
      const weight = input.healthConsent ? input.weightKg ?? null : null;
      await client.query(
        `insert into customer_profiles (user_id, goals, target_days_per_week, height_cm, weight_kg) values ($1, $2, $3, $4, $5)
         on conflict (user_id) do update set goals = excluded.goals, target_days_per_week = excluded.target_days_per_week, height_cm = excluded.height_cm, weight_kg = excluded.weight_kg`,
        [userId, input.goal ? [input.goal] : [], input.targetDaysPerWeek ?? null, height, weight],
      );
    });
    return this.get(userId);
  }
}
