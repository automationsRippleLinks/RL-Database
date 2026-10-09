import type { ProvisionalData } from './types';
import data from '../data/provisional.json';

/**
 * SWAP POINT for Brands, Campaigns and Pitches.
 * Today: the provisional mock file. Later: fetch every brand, campaign and pitch from the backend (all pages,
 * or a summary endpoint) and return the same shape. Counts on the tabs are computed from the COMPLETE list.
 */
export async function loadProvisional(): Promise<ProvisionalData> {
  return data as unknown as ProvisionalData;
}
