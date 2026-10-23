'use client';

import { createContext, useContext } from 'react';

import type { Me } from '@/lib/api';

const MeContext = createContext<Me | null>(null);
export const MeProvider = MeContext.Provider;
export const useMe = () => useContext(MeContext);

// The API checks every request. This only decides what to show. If the profile could not be loaded, show everything and let the API say no.
export const can = (me: Me | null, permission: string): boolean => me === null || me.permissions.includes(permission);
