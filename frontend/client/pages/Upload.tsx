import { useCallback, useEffect, useRef, useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { UploadCloud, MousePointer2, Trash2, Play, ExternalLink } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { apiClient } from "@/lib/api";
import type { DetectionJobSummary } from "@shared/api";

interface Zone { id: string; name: string; max: number; points: { x: number; y: number }[] }

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState("");
  const [baseMax, setBaseMax] = useState<number>(100);
  const [threshold, setThreshold] = useState<number>(80);
  const [frameSkip, setFrameSkip] = useState<number>(1);
  const [confidence, setConfidence] = useState<number>(70);
  const [motion, setMotion] = useState(true);
  const [zones, setZones] = useState<Zone[]>([]);
  const [job, setJob] = useState<DetectionJobSummary | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const handleDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) setFile(f);
  };

  const onStart = async () => {
    const trimmedUrl = url.trim();
    if (!file && !trimmedUrl) {
      toast({
        variant: "destructive",
        title: "Missing source",
        description: "Upload a video or provide a stream URL to start detection.",
      });
      return;
    }

    try {
      setIsSubmitting(true);
      const form = new FormData();
      const sourceType = file ? "upload" : "stream";
      form.append("sourceType", sourceType);
      if (file) {
        form.append("file", file);
      } else if (trimmedUrl) {
        form.append("streamUrl", trimmedUrl);
      }
      form.append("frameSkip", String(frameSkip));
      form.append("confidence", String(confidence));
      form.append("baseMax", String(baseMax));
      form.append("maxFrames", "0");
      form.append("notes", `motion=${motion};threshold=${threshold}`);
      const response = await apiClient.detection.start(form);
      setJob(response.job);
      toast({
        title: "Detection started",
        description: `Job ${response.job.id} is now ${response.job.status}.`,
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Failed to start detection",
        description: error instanceof Error ? error.message : "Unknown error occurred",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AppLayout>
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Upload & Configure</h1>
        <p className="mt-2 text-muted-foreground">Set up your video source and detection parameters to get started</p>
      </div>
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card className="border-2 border-blue-200/50 bg-gradient-to-br from-blue-50/40 to-cyan-50/40">
            <CardHeader>
              <CardTitle className="text-lg">Video Source</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">Upload a video file or provide a live stream URL</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <label
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                className="flex flex-col items-center justify-center border-2 border-dashed border-blue-300/50 rounded-2xl p-12 text-center cursor-pointer hover:bg-blue-100/30 transition-colors"
              >
                <UploadCloud className="h-8 w-8 mb-3 text-blue-600" />
                <p className="text-sm font-medium text-foreground">Drag & drop video here</p>
                <p className="text-xs text-muted-foreground mt-1">or click to browse (MP4, MOV, AVI)</p>
                <input type="file" accept="video/*" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
              </label>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-foreground mb-2">Selected file</p>
                  <Input readOnly value={file?.name || "No file selected"} className="border-slate-200/50 rounded-lg bg-white" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground mb-2">Stream URL</p>
                  <Input placeholder="rtsp://... or https://..." value={url} onChange={(e) => setUrl(e.target.value)} className="border-slate-200/50 rounded-lg" />
                </div>
              </div>
            </CardContent>
          </Card>

          <RestrictedZones zones={zones} setZones={setZones} />
        </div>
        <div className="space-y-6">
          <Card className="border-2 border-orange-200/50 bg-gradient-to-br from-orange-50/40 to-red-50/40">
            <CardHeader>
              <CardTitle className="text-lg">Detection Settings</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">Configure detection parameters</p>
            </CardHeader>
            <CardContent className="space-y-6">
              <ConfigSlider label="Base Maximum Count" value={baseMax} onChange={setBaseMax} min={10} max={500} step={10} />
              <ConfigSlider label="Alert Threshold" value={threshold} onChange={setThreshold} min={10} max={100} step={5} />
              <ConfigSlider label="Frame Skip" value={frameSkip} onChange={setFrameSkip} min={1} max={10} step={1} />
              <ConfigSlider label="Confidence Threshold" value={confidence} onChange={setConfidence} min={10} max={90} step={5} suffix="%" />
              <div className="flex items-center justify-between pt-2 border-t border-orange-200/30">
                <span className="text-sm font-medium text-foreground">Motion Analysis</span>
                <Switch checked={motion} onCheckedChange={setMotion} />
              </div>
            </CardContent>
          </Card>
          <Button
            className="w-full bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 rounded-lg font-semibold py-6 text-base"
            onClick={onStart}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              "Starting..."
            ) : (
              <>
                <Play className="h-4 w-4 mr-2" /> Start Detection
              </>
            )}
          </Button>
          {job && <JobStatusCard job={job} />}
        </div>
      </div>
    </AppLayout>
  );
}

function ConfigSlider({ label, value, onChange, min, max, step, suffix }: { label: string; value: number; onChange: (v: number) => void; min: number; max: number; step: number; suffix?: string }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3 text-sm">
        <span className="font-medium text-foreground">{label}</span>
        <span className="text-blue-600 font-semibold">{value}{suffix || ""}</span>
      </div>
      <Slider value={[value]} min={min} max={max} step={step} onValueChange={(v) => onChange(v[0])} className="rounded-full" />
    </div>
  );
}

function RestrictedZones({ zones, setZones }: { zones: Zone[]; setZones: (z: Zone[]) => void }) {
  const [name, setName] = useState("");
  const [max, setMax] = useState(50);
  const [points, setPoints] = useState<{ x: number; y: number }[]>([]);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (points.length) {
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
      ctx.strokeStyle = "#3b82f6";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = "#93c5fd";
      points.forEach(p => { ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2); ctx.fill(); });
    }
    zones.forEach((z) => {
      if (z.points.length < 3) return;
      ctx.beginPath();
      ctx.moveTo(z.points[0].x, z.points[0].y);
      for (let i = 1; i < z.points.length; i++) ctx.lineTo(z.points[i].x, z.points[i].y);
      ctx.closePath();
      ctx.fillStyle = "rgba(59, 130, 246, 0.2)";
      ctx.strokeStyle = "#60a5fa";
      ctx.lineWidth = 2;
      ctx.fill();
      ctx.stroke();
    });
  }, [points, zones]);

  useEffect(() => { redraw(); }, [redraw]);

  const onCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
    const x = e.clientX - rect.left; const y = e.clientY - rect.top;
    setPoints((prev) => [...prev, { x, y }]);
  };

  const onClosePolygon = () => {
    if (points.length < 3 || !name.trim()) return;
    const zone: Zone = { id: crypto.randomUUID(), name: name.trim(), max, points };
    setZones([zone, ...zones]);
    setPoints([]);
    setName("");
  };

  const onDelete = (id: string) => setZones(zones.filter(z => z.id !== id));

  const width = 960; const height = 540;

  return (
    <Card className="border-2 border-slate-200/50">
      <CardHeader>
        <CardTitle className="text-lg">Restricted Zones</CardTitle>
        <p className="text-sm text-muted-foreground mt-1">Draw zones on the preview to set area limits</p>
      </CardHeader>
      <CardContent>
        <div className="grid lg:grid-cols-5 gap-6">
          <div className="lg:col-span-3">
            <div className="relative rounded-2xl overflow-hidden border-2 border-slate-200">
              <canvas
                ref={canvasRef}
                width={width}
                height={height}
                onClick={onCanvasClick}
                className="w-full bg-slate-900 cursor-crosshair"
              />
              <div className="absolute top-3 left-3 bg-black/60 text-white text-xs px-3 py-1.5 rounded-lg flex items-center gap-2 font-medium">
                <MousePointer2 className="h-3 w-3" /> Click to add points
              </div>
            </div>
          </div>
          <div className="lg:col-span-2 space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground block mb-2">Zone name</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., Exit Corridor" className="border-slate-200/50 rounded-lg" />
            </div>
            <ConfigSlider label="Max people" value={max} onChange={setMax} min={10} max={500} step={10} />
            <div className="flex gap-2 pt-2">
              <Button onClick={onClosePolygon} disabled={points.length < 3 || !name.trim()} className="flex-1 bg-blue-500 hover:bg-blue-600 rounded-lg">
                Save Zone
              </Button>
              <Button variant="outline" onClick={() => setPoints([])} className="flex-1 border-slate-200/50 rounded-lg">
                Reset
              </Button>
            </div>
            <div className="pt-2 border-t border-slate-200/50">
              <p className="text-sm font-medium text-foreground mb-3">Zones ({zones.length})</p>
              <div className="space-y-2 max-h-60 overflow-auto pr-1">
                {zones.map((z) => (
                  <div key={z.id} className="flex items-center justify-between rounded-lg border border-slate-200/50 bg-slate-50/50 p-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">{z.name}</p>
                      <p className="text-xs text-muted-foreground">Max: {z.max} • {z.points.length} points</p>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => onDelete(z.id)} className="text-red-600 hover:bg-red-50" aria-label={`Delete ${z.name}`}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                {zones.length === 0 && <p className="text-xs text-muted-foreground text-center py-3">No zones yet</p>}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function JobStatusCard({ job }: { job: DetectionJobSummary }) {
  return (
    <Card className="border-2 border-blue-200/50">
      <CardHeader>
        <CardTitle className="text-base flex items-center justify-between">
          Recent Detection Job
          <span className="text-xs px-2 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200/60">
            {job.status.toUpperCase()}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Job ID</span>
          <code className="text-xs">{job.id}</code>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Source</span>
          <span className="font-medium">{job.sourceName}</span>
        </div>
        {job.stats && (
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="rounded-lg border border-slate-200/60 p-2">
              <p className="text-muted-foreground">Total Detections</p>
              <p className="text-lg font-semibold">{job.stats.totalDetections}</p>
            </div>
            <div className="rounded-lg border border-slate-200/60 p-2">
              <p className="text-muted-foreground">Max People</p>
              <p className="text-lg font-semibold">{job.stats.maxPeople}</p>
            </div>
          </div>
        )}
        {(job.artifacts?.video || job.artifacts?.csv) && (
          <div className="space-y-2">
            <p className="text-muted-foreground text-xs">Artifacts</p>
            <div className="flex flex-wrap gap-3">
              {job.artifacts.video && (
                <a
                  href={job.artifacts.video}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline"
                >
                  <ExternalLink className="h-3 w-3" /> Processed video
                </a>
              )}
              {job.artifacts.csv && (
                <a
                  href={job.artifacts.csv}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline"
                >
                  <ExternalLink className="h-3 w-3" /> Tracking CSV
                </a>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
