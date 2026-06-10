import { useEffect, useRef, useState, useCallback } from 'react';
import { Upload, RotateCcw, RefreshCw, Trash2, ImageIcon, CheckCircle, Clock, AlertCircle, Loader2, History } from 'lucide-react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from './ui/dialog';
import {
  StudentPhoto,
  uploadStudentPhoto,
  getStudentPhotosByClient,
  getStudentPhotoStatus,
  restoreStudentPhoto,
  reprocessStudentPhoto,
  deleteStudentPhoto,
  resolvePhotoUrl,
} from '../../lib/studentPhotoApi';

// ── Status helpers ─────────────────────────────────────────────────────────────
const STATUS_CONFIG = {
  pending:    { label: 'Pending',    color: 'bg-muted text-muted-foreground',     icon: Clock },
  queued:     { label: 'Queued',     color: 'bg-blue-100 text-blue-700',          icon: Clock },
  processing: { label: 'Processing', color: 'bg-amber-100 text-amber-700',        icon: Loader2 },
  completed:  { label: 'Processed',  color: 'bg-green-100 text-green-700',        icon: CheckCircle },
  failed:     { label: 'Failed',     color: 'bg-red-100 text-red-700',            icon: AlertCircle },
  restored:   { label: 'Restored',   color: 'bg-purple-100 text-purple-700',      icon: RotateCcw },
} as const;

function StatusBadge({ status, progress }: { status: StudentPhoto['processingStatus']; progress?: number | null }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.color}`}>
      <Icon className={`h-3 w-3 ${status === 'processing' ? 'animate-spin' : ''}`} />
      {cfg.label}
      {status === 'processing' && progress != null && ` ${progress}%`}
    </span>
  );
}

// ── Photo card ────────────────────────────────────────────────────────────────
function PhotoCard({
  photo,
  onRestore,
  onReprocess,
  onDelete,
}: {
  photo: StudentPhoto;
  onRestore: (p: StudentPhoto) => void;
  onReprocess: (p: StudentPhoto) => void;
  onDelete: (p: StudentPhoto) => void;
}) {
  const [showHistory, setShowHistory] = useState(false);
  const primaryUrl   = resolvePhotoUrl(photo.primaryPhoto);
  const originalUrl  = resolvePhotoUrl(photo.originalPhoto);
  const processedUrl = resolvePhotoUrl(photo.processedPhoto ?? undefined);
  const isProcessing = photo.processingStatus === 'processing' || photo.processingStatus === 'queued';

  return (
    <div className="border rounded-xl overflow-hidden bg-card shadow-sm flex flex-col">
      {/* Photo preview */}
      <div className="relative aspect-square bg-muted flex items-center justify-center overflow-hidden">
        {primaryUrl ? (
          <img src={primaryUrl} alt={photo.studentName ?? 'Student'} className="w-full h-full object-cover" />
        ) : (
          <ImageIcon className="h-12 w-12 text-muted-foreground" />
        )}
        {isProcessing && (
          <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
            <Loader2 className="h-8 w-8 text-white animate-spin" />
          </div>
        )}
        <div className="absolute top-2 left-2">
          <StatusBadge status={photo.processingStatus} progress={photo.jobProgress} />
        </div>
        {photo.isProcessed && !photo.isRestored && (
          <div className="absolute top-2 right-2">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-600 text-white">
              <CheckCircle className="h-3 w-3" /> AI Enhanced
            </span>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-3 flex-1 flex flex-col gap-2">
        <p className="font-medium text-sm truncate">{photo.studentName ?? 'Student Photo'}</p>
        <p className="text-xs text-muted-foreground">{new Date(photo.createdAt).toLocaleDateString()}</p>

        {photo.processingError && (
          <p className="text-xs text-destructive bg-destructive/10 rounded p-1">{photo.processingError}</p>
        )}

        {/* Thumbnails row: original vs processed */}
        {photo.processedPhoto && (
          <div className="flex gap-2">
            <div className="flex-1 text-center">
              <img src={originalUrl} alt="Original" className="w-full h-12 object-cover rounded border" />
              <p className="text-xs text-muted-foreground mt-0.5">Original</p>
            </div>
            <div className="flex-1 text-center">
              <img src={processedUrl} alt="Processed" className="w-full h-12 object-cover rounded border-2 border-green-500" />
              <p className="text-xs text-muted-foreground mt-0.5">AI Enhanced</p>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap gap-1 mt-auto pt-1">
          {photo.isProcessed && !photo.isRestored && (
            <Button size="sm" variant="outline" className="gap-1 text-xs h-7 flex-1" onClick={() => onRestore(photo)}>
              <RotateCcw className="h-3 w-3" /> Restore Original
            </Button>
          )}
          {photo.processingStatus === 'failed' && (
            <Button size="sm" variant="outline" className="gap-1 text-xs h-7 flex-1" onClick={() => onReprocess(photo)}>
              <RefreshCw className="h-3 w-3" /> Retry
            </Button>
          )}
          {photo.history.length > 0 && (
            <Button size="sm" variant="ghost" className="gap-1 text-xs h-7" onClick={() => setShowHistory(true)}>
              <History className="h-3 w-3" /> {photo.history.length}
            </Button>
          )}
          <Button size="sm" variant="ghost" className="gap-1 text-xs h-7 text-destructive hover:text-destructive" onClick={() => onDelete(photo)}>
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* History dialog */}
      <Dialog open={showHistory} onOpenChange={setShowHistory}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Version History</DialogTitle>
            <DialogDescription>{photo.studentName ?? 'Student Photo'} — {photo.history.length} version(s)</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {[...photo.history].reverse().map((v) => (
              <div key={v.version} className="flex items-center gap-3 p-2 rounded border">
                <img src={resolvePhotoUrl(v.url)} alt={`v${v.version}`} className="h-12 w-12 object-cover rounded" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">v{v.version}</span>
                    <Badge variant="outline" className="text-xs">{v.type}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{new Date(v.createdAt).toLocaleString()}</p>
                  {v.note && <p className="text-xs text-muted-foreground truncate">{v.note}</p>}
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
interface StudentPhotoManagerProps {
  clientId: string;
  studentName?: string;
  dataRecordId?: string;
  compact?: boolean; // show single photo mode (e.g. ID card)
}

export function StudentPhotoManager({ clientId, studentName, dataRecordId, compact = false }: StudentPhotoManagerProps) {
  const [photos, setPhotos]               = useState<StudentPhoto[]>([]);
  const [loading, setLoading]             = useState(true);
  const [uploading, setUploading]         = useState(false);
  const [restoreTarget, setRestoreTarget] = useState<StudentPhoto | null>(null);
  const [deleteTarget, setDeleteTarget]   = useState<StudentPhoto | null>(null);
  const [error, setError]                 = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollTimers   = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());

  // ── Load photos ──────────────────────────────────────────────────────────────
  const loadPhotos = useCallback(async () => {
    try {
      const data = await getStudentPhotosByClient(clientId);
      setPhotos(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => { void loadPhotos(); }, [loadPhotos]);

  // ── Poll active jobs ─────────────────────────────────────────────────────────
  const pollStatus = useCallback(async (photoId: string) => {
    try {
      const updated = await getStudentPhotoStatus(photoId);
      setPhotos((prev) => prev.map((p) => (p._id === photoId ? { ...p, ...updated } : p)));
      if (updated.processingStatus !== 'processing' && updated.processingStatus !== 'queued') {
        const timer = pollTimers.current.get(photoId);
        if (timer) { clearInterval(timer); pollTimers.current.delete(photoId); }
      }
    } catch { /* non-fatal */ }
  }, []);

  useEffect(() => {
    photos.forEach((p) => {
      if ((p.processingStatus === 'processing' || p.processingStatus === 'queued') && !pollTimers.current.has(p._id)) {
        const timer = setInterval(() => void pollStatus(p._id), 3000);
        pollTimers.current.set(p._id, timer);
      }
    });
    return () => {
      pollTimers.current.forEach((t) => clearInterval(t));
      pollTimers.current.clear();
    };
  }, [photos, pollStatus]);

  // ── Upload ───────────────────────────────────────────────────────────────────
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const photo = await uploadStudentPhoto(file, clientId, { studentName, dataRecordId });
      setPhotos((prev) => [photo, ...prev]);
      // Start polling immediately for the new photo
      const timer = setInterval(() => void pollStatus(photo._id), 3000);
      pollTimers.current.set(photo._id, timer);
    } catch (err) {
      setError(`Upload failed: ${(err as Error).message}`);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // ── Restore ──────────────────────────────────────────────────────────────────
  const handleRestore = async () => {
    if (!restoreTarget) return;
    try {
      const updated = await restoreStudentPhoto(restoreTarget._id);
      setPhotos((prev) => prev.map((p) => (p._id === updated._id ? updated : p)));
    } catch (err) {
      setError(`Restore failed: ${(err as Error).message}`);
    } finally {
      setRestoreTarget(null);
    }
  };

  // ── Reprocess ────────────────────────────────────────────────────────────────
  const handleReprocess = async (photo: StudentPhoto) => {
    try {
      await reprocessStudentPhoto(photo._id);
      setPhotos((prev) => prev.map((p) => p._id === photo._id ? { ...p, processingStatus: 'queued', processingError: undefined } : p));
      const timer = setInterval(() => void pollStatus(photo._id), 3000);
      pollTimers.current.set(photo._id, timer);
    } catch (err) {
      setError(`Reprocess failed: ${(err as Error).message}`);
    }
  };

  // ── Delete ───────────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteStudentPhoto(deleteTarget._id);
      setPhotos((prev) => prev.filter((p) => p._id !== deleteTarget._id));
    } catch (err) {
      setError(`Delete failed: ${(err as Error).message}`);
    } finally {
      setDeleteTarget(null);
    }
  };

  // ── Compact mode: single photo ────────────────────────────────────────────────
  const latest = photos[0];

  if (compact) {
    return (
      <div className="flex flex-col items-center gap-2">
        <div className="relative w-24 h-24 rounded-full overflow-hidden border-2 border-border bg-muted flex items-center justify-center">
          {latest?.primaryPhoto ? (
            <img src={resolvePhotoUrl(latest.primaryPhoto)} alt="Student" className="w-full h-full object-cover" />
          ) : (
            <ImageIcon className="h-8 w-8 text-muted-foreground" />
          )}
          {latest && (latest.processingStatus === 'processing' || latest.processingStatus === 'queued') && (
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
              <Loader2 className="h-5 w-5 text-white animate-spin" />
            </div>
          )}
        </div>
        {latest && <StatusBadge status={latest.processingStatus} progress={latest.jobProgress} />}
        <div className="flex gap-1">
          <Button size="sm" variant="outline" className="gap-1 text-xs h-7" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
            {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
            {latest ? 'Replace' : 'Upload'}
          </Button>
          {latest?.isProcessed && !latest.isRestored && (
            <Button size="sm" variant="ghost" className="gap-1 text-xs h-7" onClick={() => setRestoreTarget(latest)}>
              <RotateCcw className="h-3 w-3" /> Restore
            </Button>
          )}
        </div>
        <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/bmp" className="hidden" onChange={handleFileChange} />
        {error && <p className="text-xs text-destructive">{error}</p>}

        {/* Restore confirmation */}
        <Dialog open={!!restoreTarget} onOpenChange={(o) => !o && setRestoreTarget(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Restore Original Photo?</DialogTitle>
              <DialogDescription>
                This will remove the AI-processed version and set the original upload as the primary photo. The processed version will remain in history.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRestoreTarget(null)}>Cancel</Button>
              <Button onClick={handleRestore}>Restore Original</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // ── Full gallery mode ─────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold">Student Photos</h3>
          <Badge variant="secondary">{photos.length}</Badge>
        </div>
        <Button size="sm" className="gap-2" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          Upload Photo
        </Button>
        <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/bmp" className="hidden" onChange={handleFileChange} />
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
          <button className="ml-auto text-xs underline" onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : photos.length === 0 ? (
        <div
          className="border-2 border-dashed rounded-xl p-12 text-center cursor-pointer hover:border-primary/50 transition-colors"
          onClick={() => fileInputRef.current?.click()}
        >
          <ImageIcon className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">No photos yet. Click to upload the first photo.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {photos.map((photo) => (
            <PhotoCard
              key={photo._id}
              photo={photo}
              onRestore={setRestoreTarget}
              onReprocess={handleReprocess}
              onDelete={setDeleteTarget}
            />
          ))}
        </div>
      )}

      {/* Restore confirmation dialog */}
      <Dialog open={!!restoreTarget} onOpenChange={(o) => !o && setRestoreTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restore Original Photo?</DialogTitle>
            <DialogDescription>
              The AI-processed photo will be deactivated and the original upload will become the primary photo again.
              The processed version is preserved in history and can be viewed anytime.
            </DialogDescription>
          </DialogHeader>
          {restoreTarget && (
            <div className="flex gap-4 py-2">
              <div className="flex-1 text-center">
                <img src={resolvePhotoUrl(restoreTarget.processedPhoto ?? undefined)} alt="Processed" className="w-full h-32 object-cover rounded border" />
                <p className="text-xs text-muted-foreground mt-1">Current (AI Enhanced)</p>
              </div>
              <div className="flex-1 text-center">
                <img src={resolvePhotoUrl(restoreTarget.originalPhoto)} alt="Original" className="w-full h-32 object-cover rounded border-2 border-primary" />
                <p className="text-xs text-muted-foreground mt-1">Will become primary</p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRestoreTarget(null)}>Cancel</Button>
            <Button onClick={handleRestore}>
              <RotateCcw className="h-4 w-4 mr-2" /> Restore Original
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Photo?</DialogTitle>
            <DialogDescription>
              This will permanently delete the photo and all its versions. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
