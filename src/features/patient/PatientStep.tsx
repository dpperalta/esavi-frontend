import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import type { CreatePatientInput } from '@/contracts/patient';
import type { PatientListRow } from '@/contracts/declared/patient';
import { getErrorMessage } from '@/shared/api/errorMessages';
import { EsaviApiError } from '@/shared/api/types';
import { ResourceForm } from '@/shared/components/ResourceForm';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent } from '@/shared/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { PatientForm } from './PatientForm';
import { PatientSearchPanel, type PatientSearchMode } from './PatientSearchPanel';
import { createWithProvisionalDocumentRetry, isProvisionalDocumentNumber } from './provisionalDocument';
import { patientResource, usePatientSearchByIdentifier, usePatientSearchByName } from './api';
import { createPatientSchema, patientErrorFieldMap, type PatientFormValues } from './schemas';

const SEARCH_DEBOUNCE_MS = 400;

function PatientResultCard({ row, onSelect }: { row: PatientListRow; onSelect: () => void }) {
  const { t } = useTranslation();
  return (
    <Card>
      <CardContent className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-0.5">
          <p className="text-sm font-medium text-foreground">
            {row.names} {row.lastNames}
          </p>
          <p className="text-sm text-muted-foreground">{row.documentNumber ?? '—'}</p>
          <p className="text-sm text-muted-foreground">{row.healthSystemCode ?? '—'}</p>
        </div>
        <Button type="button" onClick={onSelect}>
          {t('patient.results.useButton')}
        </Button>
      </CardContent>
    </Card>
  );
}

// The "doble camino" of SPEC FE10 §3.6/§5: a `409 PATIENT_001_DOCUMENT_EXISTS` on a document the
// user typed themselves fires `006` behind the scenes and offers the titular, or says it isn't
// available — never a field error on `documentNumber`.
function DuplicatePatientPanel({ identifier, onUse }: { identifier: string; onUse: (id: string) => void }) {
  const { t } = useTranslation();
  const search = usePatientSearchByIdentifier({ identifier, pageSize: 10 });

  if (search.isLoading) {
    return <Skeleton className="h-20 w-full" />;
  }

  const rows = search.data?.rows ?? [];
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('patient.duplicate.unavailable')}</p>;
  }

  const row = rows[0];
  return (
    <Card>
      <CardContent className="flex flex-col gap-2">
        <p className="text-sm font-medium text-foreground">{t('patient.duplicate.title')}</p>
        <p className="text-sm text-muted-foreground">
          {row.names} {row.lastNames} — {row.documentNumber ?? '—'}
        </p>
        <Button type="button" onClick={() => onUse(row.patientId)} className="self-start">
          {t('patient.duplicate.useButton')}
        </Button>
      </CardContent>
    </Card>
  );
}

// SPEC FE10 §3.6/§3.7: a diálogo, not an inline block — it's the only moment the provisional
// identifier is shown, and closing it (never dismissing to nothing) is what lets the user continue.
function ProvisionalDocumentDialog({
  documentNumber,
  onClose,
}: {
  documentNumber: string | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    if (!documentNumber) return;
    await navigator.clipboard.writeText(documentNumber);
    setCopied(true);
  }

  return (
    <Dialog open={!!documentNumber} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('patient.provisional.title')}</DialogTitle>
        </DialogHeader>
        <p className="select-all rounded-md border bg-muted px-3 py-4 text-center text-2xl font-semibold tracking-wide">
          {documentNumber}
        </p>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" onClick={handleCopy} className="flex-1">
            {t('patient.provisional.copy')}
          </Button>
          <Button type="button" onClick={onClose} className="flex-1">
            {t('common.close')}
          </Button>
        </div>
        <span role="status" className="sr-only">
          {copied ? t('patient.provisional.copied') : ''}
        </span>
      </DialogContent>
    </Dialog>
  );
}

function SelectedPatientSummary({ patientId, onChange }: { patientId: string; onChange: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const existing = patientResource.useOne(patientId);

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">{t('patient.selected.label')}</p>
        <p className="text-base font-medium text-foreground">
          {existing.isLoading ? t('common.loading') : `${existing.data?.names} ${existing.data?.lastNames}`}
        </p>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" onClick={onChange}>
            {t('patient.selected.change')}
          </Button>
          <Button
            type="button"
            onClick={() => navigate(`/esavi-cases/new/case-opening?patientId=${patientId}`)}
          >
            {t('patient.actions.continue')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// Paso 1 del alta (SPEC FE10 §3.1): buscar o crear al paciente. Este archivo cubre el modo alta —
// `/esavi-cases/new/patient` — únicamente; el modo reentrada (`/esavi-cases/:id/wizard/patient`,
// identidad de sólo lectura + "Editar paciente") lo añade el paso 13 del plan de implementación,
// que es el que también abre esos dos slugs en `steps.ts`.
export function PatientStep() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const patientId = searchParams.get('patientId');

  const [mode, setMode] = useState<PatientSearchMode>('identifier');
  // Excepción declarada de §3.4/§7: un documento o un apellido es un dato personal, y la URL
  // sobrevive en el historial del navegador — se queda en `useState`, nunca en `searchParams`.
  const [term, setTerm] = useState('');
  const [debouncedTerm, setDebouncedTerm] = useState('');
  useEffect(() => {
    const handle = window.setTimeout(() => setDebouncedTerm(term), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [term]);

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [duplicateIdentifier, setDuplicateIdentifier] = useState<string | null>(null);
  const [provisionalDocument, setProvisionalDocument] = useState<string | null>(null);
  const lastSubmittedDocumentNumber = useRef('');

  function handleModeChange(nextMode: PatientSearchMode) {
    setMode(nextMode);
    setShowCreateForm(false);
    setDuplicateIdentifier(null);
  }

  function handleTermChange(nextTerm: string) {
    setTerm(nextTerm);
    setShowCreateForm(false);
    setDuplicateIdentifier(null);
  }

  function selectPatient(id: string) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('patientId', id);
      return next;
    });
    setShowCreateForm(false);
    setDuplicateIdentifier(null);
  }

  const identifierSearch = usePatientSearchByIdentifier({
    identifier: mode === 'identifier' ? debouncedTerm : '',
    pageSize: 10,
  });
  const nameSearch = usePatientSearchByName({
    name: mode === 'name' ? debouncedTerm : '',
    pageSize: 10,
  });
  const activeSearch = mode === 'identifier' ? identifierSearch : nameSearch;

  const create = patientResource.useCreate();

  async function handleCreateSubmit(values: PatientFormValues) {
    lastSubmittedDocumentNumber.current = values.documentNumber;
    const provisional = isProvisionalDocumentNumber(values.documentNumber);
    try {
      const created = provisional
        ? await createWithProvisionalDocumentRetry(
            (documentNumber) =>
              create.mutateAsync({ ...values, documentNumber } satisfies CreatePatientInput),
            (error) => error instanceof EsaviApiError && error.code === 'PATIENT_001_DOCUMENT_EXISTS',
            { initialDocumentNumber: values.documentNumber },
          )
        : await create.mutateAsync(values satisfies CreatePatientInput);

      setShowCreateForm(false);
      if (provisional) {
        setProvisionalDocument(created.documentNumber ?? values.documentNumber);
      }
      selectPatient(created.patientId);
    } catch {
      // Left for `ResourceForm`'s reactive `error` prop (bound to `create.error`, which
      // `mutateAsync` updates exactly like `mutate` does) to display: field-mapped via
      // `patientErrorFieldMap`, or routed to `handleUnmappedError` below.
    }
  }

  function handleUnmappedError(error: EsaviApiError) {
    // A `409` on a document the user actually typed is a finding, not a form error (§3.6): it
    // never reaches here as a toast. A `409` on a `PROV-` that survived three regenerations is
    // the near-impossible collision case (§7 riesgo) and falls through to the toast below.
    if (
      error.code === 'PATIENT_001_DOCUMENT_EXISTS' &&
      !isProvisionalDocumentNumber(lastSubmittedDocumentNumber.current)
    ) {
      setDuplicateIdentifier(lastSubmittedDocumentNumber.current);
      return;
    }
    toast.error(getErrorMessage(error));
  }

  const mutationError = create.error instanceof EsaviApiError ? create.error : null;

  if (patientId) {
    return <SelectedPatientSummary patientId={patientId} onChange={() => setSearchParams({})} />;
  }

  const hasSearched = debouncedTerm.trim().length > 0;
  const rows = activeSearch.data?.rows ?? [];
  const inactiveCount = mode === 'name' ? (nameSearch.data?.inactiveCount ?? 0) : 0;
  const searchIsLoading = hasSearched && (activeSearch.isLoading || activeSearch.isFetching);
  const searchIsError = hasSearched && activeSearch.isError;
  const searchIsReady = hasSearched && !searchIsLoading && !searchIsError;

  return (
    <div className="flex flex-col gap-4">
      <PatientSearchPanel
        mode={mode}
        onModeChange={handleModeChange}
        term={term}
        onTermChange={handleTermChange}
      />

      {/* The duplicate-finding state replaces the ordinary search results entirely (SPEC FE10
          §3.6) — both can share the same -006 query key when the finding's identifier happens to
          equal the search term, and rendering both at once would show the same card twice. */}
      {!duplicateIdentifier && searchIsLoading && (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      )}

      {!duplicateIdentifier && searchIsError && (
        <div className="flex items-center gap-2">
          <p className="text-sm text-destructive">
            {activeSearch.error instanceof EsaviApiError
              ? getErrorMessage(activeSearch.error)
              : t('common.errors.unexpected')}
          </p>
          <Button type="button" variant="outline" size="sm" onClick={() => void activeSearch.refetch()}>
            {t('common.table.retry')}
          </Button>
        </div>
      )}

      {!duplicateIdentifier && searchIsReady && rows.length > 0 && (
        <div className="flex flex-col gap-2">
          {rows.map((row) => (
            <PatientResultCard key={row.patientId} row={row} onSelect={() => selectPatient(row.patientId)} />
          ))}
        </div>
      )}

      {!duplicateIdentifier && searchIsReady && rows.length === 0 && (
        <div className="flex flex-col gap-3">
          {inactiveCount > 0 ? (
            <p className="text-sm text-muted-foreground">
              {t('patient.search.inactiveFound', { count: inactiveCount })}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">{t('patient.search.empty')}</p>
          )}
          {!showCreateForm && (
            <Button type="button" variant="outline" className="self-start" onClick={() => setShowCreateForm(true)}>
              {t('patient.results.createButton')}
            </Button>
          )}
        </div>
      )}

      {duplicateIdentifier && (
        <DuplicatePatientPanel identifier={duplicateIdentifier} onUse={selectPatient} />
      )}

      {showCreateForm && !duplicateIdentifier && (
        <ResourceForm<PatientFormValues>
          schema={createPatientSchema}
          defaultValues={{
            names: '',
            lastNames: '',
            documentNumber: '',
            passportNumber: '',
            birthDate: null,
            email: '',
            phoneNumber: '',
            sexItemId: null,
            residenceGeoLocationId: null,
          }}
          onSubmit={handleCreateSubmit}
          error={mutationError}
          errorFieldMap={patientErrorFieldMap}
          onUnmappedError={handleUnmappedError}
          isSubmitting={create.isPending}
          onCancel={() => setShowCreateForm(false)}
          submitLabel="common.actions.create"
        >
          {(form) => <PatientForm form={form} />}
        </ResourceForm>
      )}

      <ProvisionalDocumentDialog documentNumber={provisionalDocument} onClose={() => setProvisionalDocument(null)} />
    </div>
  );
}
