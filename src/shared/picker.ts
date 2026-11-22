import type { PickResult } from './types';

export const PICKER_PORT = 'reface-picker';
export const MAX_PICKED_ELEMENTS = 8;

export type PickerCommand = { type: 'start' | 'stop' } | { type: 'highlight'; selectors: string[] };

export type PickerEvent = { type: 'picked'; result: PickResult } | { type: 'stopped' };
