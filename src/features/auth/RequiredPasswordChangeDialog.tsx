import { useTranslation } from 'react-i18next';
import { useCurrentUser } from './api';
import { ChangePasswordForm } from './ChangePasswordForm';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog';

// Not dismissible: no close button, Escape and outside-click are swallowed. `open` is derived
// from requiresPasswordChange — never a local useState — so a successful PATCH's invalidation
// of ['user','me'] is what closes it (SPEC FE01 §3.4). Rendered once in AppShell so it can
// intercept any route behind <RequireAuth>.
export function RequiredPasswordChangeDialog() {
  const { t } = useTranslation();
  const { data: user } = useCurrentUser();
  const open = user?.requiresPasswordChange === true;

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        showCloseButton={false}
        onEscapeKeyDown={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{t('auth.changePassword.title')}</DialogTitle>
          <DialogDescription>{t('auth.changePassword.required')}</DialogDescription>
        </DialogHeader>
        <ChangePasswordForm />
      </DialogContent>
    </Dialog>
  );
}
