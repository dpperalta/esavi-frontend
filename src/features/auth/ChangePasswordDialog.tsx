import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/shared/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/shared/components/ui/dialog';
import { ChangePasswordForm } from './ChangePasswordForm';

// Dismissible, opened from the Topbar (SPEC FE01 §3.4: "Diálogo de cambio de contraseña |
// useState del componente"). The required dialog below is a separate component — it doesn't
// share this open state, since its own is derived, not owned.
export function ChangePasswordDialog() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          {t('auth.changePassword.title')}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('auth.changePassword.title')}</DialogTitle>
        </DialogHeader>
        <ChangePasswordForm onSuccess={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
