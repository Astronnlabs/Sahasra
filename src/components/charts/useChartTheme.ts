import { useMemo } from 'react';
import { useTheme } from '@/app/providers/ThemeProvider';

/** Sahasra purple family first; semantic colours only where meaning requires. */
export function useChartTheme() {
  const { theme } = useTheme();
  return useMemo(() => {
    const dark = theme === 'dark';
    return {
      series: dark ? ['#8B66F7', '#B9A2FA', '#6A4FC0', '#4F3D8C', '#2F2758'] : ['#6D3DE8', '#9B7BF0', '#C6B4F7', '#5730C7', '#E3DAFC'],
      primary: dark ? '#8B66F7' : '#6D3DE8',
      secondary: dark ? '#4F4670' : '#D9CFF7',
      grid: dark ? '#2A2540' : '#EFEBF7',
      axis: dark ? '#7A758C' : '#9A96A5',
      surface: dark ? '#1B1827' : '#FFFFFF',
      success: dark ? '#34C780' : '#20A66A',
      warning: dark ? '#F0B234' : '#E5A11A',
      danger: dark ? '#F46267' : '#E5484D',
    };
  }, [theme]);
}
