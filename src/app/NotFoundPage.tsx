import { useTranslation } from 'react-i18next';

export function NotFoundPage() {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-dvh items-center justify-center p-4 text-center">
      <p className="text-muted-foreground">{t('errors.notFound')}</p>
    </div>
  );
}
