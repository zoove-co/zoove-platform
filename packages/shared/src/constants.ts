export const USER_ROLES = ['customer', 'trainer', 'admin'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const CLUSTER_STATUSES = ['locked', 'active'] as const;
export type ClusterStatus = (typeof CLUSTER_STATUSES)[number];

export const EVENT_SOURCES = ['customer_app', 'trainer_app', 'admin', 'website', 'api'] as const;
export type EventSource = (typeof EVENT_SOURCES)[number];

// Identifiers for the app bundles. Hard to change after the first store release, so fixed now.
export const APP_IDS = {
  customer: 'co.zoove.customer',
  trainer: 'co.zoove.trainer',
} as const;
