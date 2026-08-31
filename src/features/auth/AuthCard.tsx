import type { ReactNode } from 'react';
import { Card } from '@/shared/components/ui/card';

// Shared wrapper for the three public auth screens (SPEC FE01 §3.7): a centered card,
// max-w-sm, full width with margin below sm.
export function AuthCard({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center p-4">
      <Card className="w-full max-w-sm">{children}</Card>
    </div>
  );
}
