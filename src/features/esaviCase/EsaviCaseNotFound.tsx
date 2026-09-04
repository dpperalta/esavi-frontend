import { FileQuestion } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/shared/components/ui/button';

// SPEC FE09 §3.6: a foreign case and a nonexistent one are the same response, byte for byte
// (F49 §122) — `CASE_003_NOT_FOUND` and `CASE_003_OUT_OF_SCOPE` differ only in `code`, which is
// debugging material (CONVENTIONS.md §6.2) and never reaches this screen. It doesn't pretend to
// tell them apart; it names the one possibility that has a way out.
export function EsaviCaseNotFound() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-8 text-center">
      <FileQuestion aria-hidden="true" className="size-8 text-muted-foreground" />
      <p className="text-sm font-medium text-foreground">{t('esaviCase.detail.notFound.title')}</p>
      <p className="text-sm text-muted-foreground">{t('esaviCase.detail.notFound.description')}</p>
      <Button type="button" variant="outline" onClick={() => navigate('/esavi-cases')}>
        {t('esaviCase.detail.notFound.backToList')}
      </Button>
    </div>
  );
}
