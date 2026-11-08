import type { ReferralStatus } from '@/services';

/** What a business earns for each referral that joins Sahasra. */
export const REFERRAL_REWARD = '1 month free';

export const REFERRAL_STATUS: Record<ReferralStatus, { label: string; tone: 'info' | 'warning' | 'success' | 'primary' | 'neutral'; hint: string }> = {
  new: { label: 'Sent', tone: 'info', hint: 'Sahasra team will call them soon' },
  contacted: { label: 'Talking', tone: 'warning', hint: 'Sahasra team is talking to them' },
  joined: { label: 'Joined', tone: 'success', hint: 'They joined — your reward is on the way' },
  rewarded: { label: 'Reward given', tone: 'primary', hint: `${REFERRAL_REWARD} added to your plan` },
  declined: { label: 'Not joining', tone: 'neutral', hint: 'They decided not to join for now' },
};
