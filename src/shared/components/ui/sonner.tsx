import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from 'lucide-react';
import type { CSSProperties } from 'react';
import { Toaster as Sonner, type ToasterProps } from 'sonner';
import { useResolvedTheme } from '@/shared/hooks/useSyncTheme';

// The shadcn registry component reads next-themes; this app has its own theme system
// (preferencesStore + data-theme, ARCHITECTURE.md §6), so it reads useResolvedTheme instead.
const Toaster = ({ ...props }: ToasterProps) => {
  const theme = useResolvedTheme();

  return (
    <Sonner
      theme={theme}
      className="toaster group"
      // Without this, sonner never applies the --success-*/--warning-*/--info-*/--error-*
      // variables below — every toast falls back to --normal-*, which is why they all looked
      // the same regardless of type.
      richColors
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          '--normal-bg': 'var(--popover)',
          '--normal-text': 'var(--popover-foreground)',
          '--normal-border': 'var(--border)',
          '--border-radius': 'var(--radius)',
          // Tokens, not literals (CONVENTIONS.md §10.1): each type borrows the app's own
          // semantic color — success/warning are new tokens, info reuses --primary (already
          // blue), error reuses --destructive. The background is a light mix toward --popover
          // so it reads correctly in both themes without a second hand-picked value per type.
          //
          // Mixed `in oklab`, not `in oklch`: --popover is achromatic (chroma 0, hue powerless).
          // Chromium's `color-mix(in oklch, …)` produces an unstable, essentially random hue at
          // low percentages against a fully achromatic endpoint (verified live: 12% green into
          // oklch(1 0 0) rendered as pale *pink*, not pale green). oklab has no polar hue
          // component to go undefined, so it doesn't hit that edge case.
          '--success-bg': 'color-mix(in oklab, var(--success) 12%, var(--popover))',
          '--success-border': 'color-mix(in oklab, var(--success) 35%, var(--popover))',
          '--success-text': 'var(--success)',
          '--warning-bg': 'color-mix(in oklab, var(--warning) 12%, var(--popover))',
          '--warning-border': 'color-mix(in oklab, var(--warning) 35%, var(--popover))',
          '--warning-text': 'var(--warning)',
          '--info-bg': 'color-mix(in oklab, var(--primary) 12%, var(--popover))',
          '--info-border': 'color-mix(in oklab, var(--primary) 35%, var(--popover))',
          '--info-text': 'var(--primary)',
          '--error-bg': 'color-mix(in oklab, var(--destructive) 12%, var(--popover))',
          '--error-border': 'color-mix(in oklab, var(--destructive) 35%, var(--popover))',
          '--error-text': 'var(--destructive)',
        } as CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: 'cn-toast',
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
