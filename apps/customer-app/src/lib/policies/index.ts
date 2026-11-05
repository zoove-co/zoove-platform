import data from './policies.json';

export type PolicyKey = 'terms' | 'privacy' | 'cancellation';
type Policy = { title: string; intro: string; sections: { heading: string; body: string[] }[] };
export const POLICIES = data as { version: string; updated: string; contact: string; docs: Record<PolicyKey, Policy> };
