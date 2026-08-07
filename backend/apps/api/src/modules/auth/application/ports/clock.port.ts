/**
 * TCHATCHA — Port : horloge injectable (tests déterministes).
 */
export interface ClockPort {
  now(): Date;
}

export const ClockPortToken = 'ClockPort';
