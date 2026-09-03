import { type ChangeEvent, type DragEvent, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { FileSpreadsheet, Loader2, Upload, X } from 'lucide-react';
import type { UseMutationResult } from '@tanstack/react-query';
import { getErrorMessage } from '@/shared/api/errorMessages';
import { EsaviApiError } from '@/shared/api/types';
import { ROLE_LEVELS } from '@/shared/config/roles';
import { useCan } from '@/shared/hooks/useCan';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/shared/components/ui/alert-dialog';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Switch } from '@/shared/components/ui/switch';
import { cn } from '@/shared/lib/utils';
import type { GeoImportReport as GeoImportReportData } from '@/contracts/geoImport';
import { GeoImportReport } from './GeoImportReport';
import { useGenerateGeoTemplate, useImportGeoData } from './importApi';
import { geoImportFileSchema } from './schemas';

// SPEC FE07 §3.2: the six `409`s of `geoLevelType` carry their detail in `message`, not `errors`
// — the only place in the screen where the backend's own text is shown as-is, unrouted through
// i18n (§6.2 normally forbids exactly that).
function isLevelTypesError(code: string): boolean {
  return code.includes('LEVEL_TYPES');
}

interface ApiErrorAlertProps {
  error: EsaviApiError;
}

function ApiErrorAlert({ error }: ApiErrorAlertProps) {
  const { t } = useTranslation();

  if (isLevelTypesError(error.code)) {
    return (
      <div
        role="alert"
        className="flex flex-col gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
      >
        <p>{error.message}</p>
        <Link to="/geo-level-types" className="underline underline-offset-2">
          {t('geoBulkImport.errors.levelTypesAction')}
        </Link>
      </div>
    );
  }

  return (
    <p
      role="alert"
      className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
    >
      {getErrorMessage(error)}
    </p>
  );
}

function TemplateCard() {
  const { t } = useTranslation();
  const [includeExisting, setIncludeExisting] = useState(true);
  const generateTemplate = useGenerateGeoTemplate();
  const error = generateTemplate.error instanceof EsaviApiError ? generateTemplate.error : null;

  return (
    <Card aria-busy={generateTemplate.isPending}>
      <CardHeader>
        <CardTitle>{t('geoBulkImport.template.title')}</CardTitle>
        <CardDescription>{t('geoBulkImport.template.description')}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <label className="flex items-center gap-2 text-sm">
          <Switch
            checked={includeExisting}
            onCheckedChange={setIncludeExisting}
            aria-label={t('geoBulkImport.template.includeExisting')}
          />
          <span>{t('geoBulkImport.template.includeExisting')}</span>
        </label>
        <p className="text-xs text-muted-foreground">
          {t('geoBulkImport.template.includeExistingHint')}
        </p>

        {error && <ApiErrorAlert error={error} />}

        <Button
          type="button"
          onClick={() => generateTemplate.mutate(includeExisting)}
          disabled={generateTemplate.isPending}
        >
          {generateTemplate.isPending ? (
            <Loader2 aria-hidden="true" className="animate-spin" />
          ) : (
            <FileSpreadsheet aria-hidden="true" />
          )}
          {generateTemplate.isPending ? t('common.loading') : t('geoBulkImport.template.download')}
        </Button>
      </CardContent>
    </Card>
  );
}

interface UploadCardProps {
  importGeoData: UseMutationResult<
    GeoImportReportData,
    Error,
    { file: File; dryRun: boolean }
  >;
}

// Owns only the file/dropzone/confirm UI state (SPEC FE07 §3.4): the mutation itself lives in
// the parent so the report can render as a sibling below both cards, not trapped in this one.
function UploadCard({ importGeoData }: UploadCardProps) {
  const { t } = useTranslation();
  const fileInputId = useId();
  const [file, setFile] = useState<File | null>(null);
  const [fileErrorKey, setFileErrorKey] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const error = importGeoData.error instanceof EsaviApiError ? importGeoData.error : null;
  const busy = importGeoData.isPending;

  function applyFile(candidate: File) {
    const result = geoImportFileSchema.safeParse(candidate);
    if (!result.success) {
      setFile(null);
      setFileErrorKey(result.error.issues[0].message);
      return;
    }
    setFile(candidate);
    setFileErrorKey(null);
    importGeoData.reset();
  }

  function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
    const candidate = event.target.files?.[0];
    if (candidate) {
      applyFile(candidate);
    }
    event.target.value = '';
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragActive(false);
    const candidate = event.dataTransfer.files[0];
    if (candidate) {
      applyFile(candidate);
    }
  }

  function handleRemoveFile() {
    setFile(null);
    setFileErrorKey(null);
    importGeoData.reset();
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  }

  function handleValidate() {
    if (!file) return;
    importGeoData.mutate({ file, dryRun: true });
  }

  function handleImportConfirmed() {
    if (!file) return;
    importGeoData.mutate({ file, dryRun: false });
    setConfirmOpen(false);
  }

  return (
    <Card aria-busy={busy}>
      <CardHeader>
        <CardTitle>{t('geoBulkImport.upload.title')}</CardTitle>
        <CardDescription>{t('geoBulkImport.upload.description')}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <label
          htmlFor={fileInputId}
          onDragOver={(event) => {
            event.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={handleDrop}
          className={cn(
            'flex flex-col items-center gap-3 rounded-xl border-2 border-dashed p-6 text-center',
            dragActive && 'border-primary bg-primary/5',
          )}
        >
          <Upload aria-hidden="true" className="size-6 text-muted-foreground" />
          {file ? (
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-foreground">{file.name}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={t('geoBulkImport.upload.remove')}
                onClick={(event) => {
                  event.preventDefault();
                  handleRemoveFile();
                }}
                disabled={busy}
              >
                <X aria-hidden="true" />
              </Button>
            </div>
          ) : (
            <span className="text-sm text-muted-foreground">
              {t('geoBulkImport.upload.dropzone')}
            </span>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-11"
            disabled={busy}
            onClick={(event) => {
              // A <button> is itself an interactive control, so nesting it inside the <label>
              // doesn't reliably forward the click to the associated <input> across browsers
              // (unlike the drop handler above, which never goes through that mechanism at all).
              // Triggering the input directly, and stopping the label's own default action so it
              // can't double-open the dialog where forwarding does happen.
              event.preventDefault();
              inputRef.current?.click();
            }}
          >
            {t('geoBulkImport.upload.choose')}
          </Button>
          <input
            ref={inputRef}
            id={fileInputId}
            type="file"
            accept=".xlsx"
            className="sr-only"
            onChange={handleInputChange}
            disabled={busy}
          />
        </label>

        <p aria-live="polite" className="text-sm text-destructive empty:hidden">
          {fileErrorKey ? t(`geoBulkImport.upload.${fileErrorKey}`) : null}
        </p>

        {!file && !fileErrorKey && (
          <p className="text-sm text-muted-foreground">{t('geoBulkImport.upload.noFile')}</p>
        )}

        {error && <ApiErrorAlert error={error} />}

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            disabled={!file || busy}
            onClick={handleValidate}
          >
            {busy ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
            {busy ? t('common.loading') : t('geoBulkImport.upload.validate')}
          </Button>
          <Button
            type="button"
            className="flex-1"
            disabled={!file || busy}
            onClick={() => setConfirmOpen(true)}
          >
            {busy ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
            {busy ? t('common.loading') : t('geoBulkImport.upload.import')}
          </Button>
        </div>
      </CardContent>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('geoBulkImport.upload.confirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('geoBulkImport.upload.confirmBody')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.actions.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleImportConfirmed}>
              {t('geoBulkImport.upload.confirmAction')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

export function GeoBulkImportPage() {
  const { t } = useTranslation();
  const canUpload = useCan(ROLE_LEVELS.SUPERADMIN);
  const importGeoData = useImportGeoData();

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <div>
        <h1 className="text-xl font-medium text-foreground">{t('geoBulkImport.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('geoBulkImport.description')}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <TemplateCard />

        {canUpload ? (
          <UploadCard importGeoData={importGeoData} />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>{t('geoBulkImport.upload.title')}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {t('geoBulkImport.upload.requiresSuperadmin')}
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* SPEC FE07 §3.1: the report is the mutation's response, not a route — rendered under
          the form, full width below both cards. Never copied to a useState (§3.4). */}
      {canUpload && importGeoData.isSuccess && importGeoData.data && (
        <GeoImportReport report={importGeoData.data} />
      )}
    </div>
  );
}
