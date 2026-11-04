import { format, formatDistanceToNowStrict } from 'date-fns';
import { enUS, es, nl } from 'date-fns/locale';
import { useState } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/components/ui/tooltip';
import type { Language } from '@/shared/stores/preferences.types';
import { usePreferencesStore } from '@/shared/stores/preferencesStore';

const DATE_FNS_LOCALES: Record<Language, typeof es> = { es, en: enUS, nl };

export interface RelativeTimeProps {
  iso: string;
}

// Strict, not formatDistanceToNow: the latter reads «alrededor de 3 horas», and the exact date is
// one hover away anyway (SPEC FE38 §6). Recomputed on every render, with no timer of its own.
// tabIndex makes the exact date reachable by keyboard, and the click opens it on touch, where
// Radix never opens a tooltip (same reasoning as VariantsTooltip, SPEC FE37 §3.7).
export function RelativeTime({ iso }: RelativeTimeProps) {
  const language = usePreferencesStore((state) => state.language);
  const [open, setOpen] = useState(false);
  const locale = DATE_FNS_LOCALES[language];
  const date = new Date(iso);
  const exact = format(date, 'PPpp', { locale });

  return (
    <Tooltip open={open} onOpenChange={setOpen}>
      <TooltipTrigger asChild>
        <time
          dateTime={iso}
          tabIndex={0}
          onClick={() => setOpen(true)}
          className="cursor-default whitespace-nowrap rounded-sm text-sm text-muted-foreground tabular-nums outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {formatDistanceToNowStrict(date, { addSuffix: true, locale })}
        </time>
      </TooltipTrigger>
      <TooltipContent>{exact}</TooltipContent>
    </Tooltip>
  );
}
