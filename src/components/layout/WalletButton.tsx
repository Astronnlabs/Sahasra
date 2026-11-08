import { useQuery } from '@tanstack/react-query';
import { Wallet } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Tooltip } from '@/components/ui/tooltip';
import { daysLeft, WALLET_KEY } from '@/features/settings/WalletSection';
import { formatDate, formatINR } from '@/lib/format';
import { cn } from '@/lib/utils';
import { walletService } from '@/services';

/** Top-bar wallet: balance at a glance; opens the wallet page with history and recharge. */
export function WalletButton() {
  const navigate = useNavigate();
  const { data } = useQuery({ queryKey: WALLET_KEY, queryFn: walletService.get, refetchInterval: 60000, staleTime: 30000 });
  const balance = data?.balance ?? 0;
  const left = daysLeft(data?.expiresAt ?? null);
  const low = !!data && (balance < data.price * 20 || (!!data.expiresAt && left <= 5));
  const tip = !data
    ? 'Wallet'
    : data.expiresAt
      ? `Wallet: ${formatINR(balance, true)} · valid till ${formatDate(data.expiresAt)}${left <= 5 ? ` (${left} day${left === 1 ? '' : 's'} left)` : ''}`
      : 'Wallet is empty. Recharge to send bills on WhatsApp.';
  return (
    <Tooltip content={tip}>
      <Button variant="ghost" size="sm" className={cn('gap-1.5 tabular', low ? 'text-[#B07A0C] dark:text-warning' : 'text-foreground')} onClick={() => navigate('/settings?section=wallet')} aria-label={tip}>
        <Wallet className="!size-[17px]" />
        <span className="hidden sm:inline">{data ? formatINR(balance, true) : 'Wallet'}</span>
      </Button>
    </Tooltip>
  );
}
