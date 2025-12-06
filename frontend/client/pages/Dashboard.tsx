import { useEffect, useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowRight, AlertTriangle, Play, UploadCloud, X } from "lucide-react";
import { Link } from "react-router-dom";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { apiClient } from "@/lib/api";
import { DashboardStatsResponse, AlertSummary, DetectionJob, UserPreferences } from "@shared/api";
import { useToast } from "@/hooks/use-toast";
import { LiveProcessingBox } from "@/components/LiveProcessingBox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export default function Dashboard() {
  const [data, setData] = useState<DashboardStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [videoModalOpen, setVideoModalOpen] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState<{ url: string; name: string } | null>(null);
  const { toast } = useToast();

  // Load user preferences
  const [preferences, setPreferences] = useState<UserPreferences>(() => {
    try {
      const saved = localStorage.getItem("crowdDetectionPreferences");
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (error) {
      console.error("Failed to load preferences:", error);
    }
    return { detectionViewMode: "average", timeRange: "2hours" };
  });

  console.log("[Dashboard] Component rendered, loading:", loading, "data:", data);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Pass time range to API
        const response = await fetch(`/api/dashboard/stats?timeRange=${preferences.timeRange}`);
        if (!response.ok) throw new Error("Failed to fetch stats");
        const stats: DashboardStatsResponse = await response.json();
        setData(stats);
      } catch (error) {
        console.error("[Dashboard] Failed to fetch stats:", error);
        toast({
          variant: "destructive",
          title: "Failed to load dashboard",
          description: error instanceof Error ? error.message : "Unknown error",
        });
        // Set empty data structure so component can still render
        setData({
          totals: {
            detectionsToday: 0,
            averageCrowdCount: 0,
            activeAlerts: 0,
            processingJobs: 0,
            avgDensity: 0,
          },
          jobs: [],
          alerts: [],
          chart: [],
        });
      } finally {
        setLoading(false);
      }
    };
    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, [toast, preferences.timeRange]);

  if (loading || !data) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">Loading dashboard...</p>
        </div>
      </AppLayout>
    );
  }

  const stats = data.totals;

  // Use appropriate metric based on user preference
  const displayedDetectionCount = preferences.detectionViewMode === "average"
    ? stats.averageCrowdCount
    : stats.detectionsToday;

  const detectionLabel = stats.timeRangeLabel || "Today";

  return (
    <AppLayout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">Live overview of detections and capacity.</p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="secondary"><Link to="/live"><Play className="h-4 w-4" /> Start Live</Link></Button>
          <Button asChild><Link to="/upload"><UploadCloud className="h-4 w-4" /> Upload</Link></Button>
        </div>
      </div>

      <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-4 mb-8">
        <StatCard
          title={`Detections (${detectionLabel})`}
          value={displayedDetectionCount.toLocaleString()}
        />
        <StatCard title="Active Alerts" value={String(stats.activeAlerts)} variant="alert" />
        <StatCard title="Processing Jobs" value={String(stats.processingJobs)} />
        <StatCard title="Avg Crowd Density" value={`${stats.avgDensity}%`} />
      </section>

      <section className="grid xl:grid-cols-3 gap-6 mb-8">
        <Card className="xl:col-span-2 border-blue-200/50 bg-gradient-to-br from-blue-50/40 to-cyan-50/40">
          <CardHeader>
            <CardTitle className="text-base">People Count (last 24h)</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.chart} margin={{ left: 8, right: 8, bottom: 20, top: 8 }}>
                <XAxis
                  dataKey="time"
                  stroke="#888888"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  label={{ value: 'Time', position: 'insideBottom', offset: -10, style: { fontSize: 12, fill: '#888888' } }}
                />
                <YAxis
                  stroke="#888888"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  label={{ value: 'People Count', angle: -90, position: 'insideLeft', style: { fontSize: 12, fill: '#888888' } }}
                />
                <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))" }} labelStyle={{ color: "hsl(var(--muted-foreground))" }} />
                <Line type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card className="border-slate-200">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base">Live Alerts</CardTitle>
            <Button asChild variant="ghost" size="sm"><Link to="/settings" className="gap-1">Configure <ArrowRight className="h-4 w-4" /></Link></Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-2.5">
              {data.alerts.map((a) => (
                <div key={a.id} className={cnByLevel(a.level, "flex items-center justify-between rounded-lg border p-3 text-sm")}>
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <AlertTriangle className={cnByLevel(a.level, "h-4 w-4 flex-shrink-0", true)} />
                    <div className="min-w-0">
                      <p className="font-medium text-foreground">{a.message}</p>
                      <p className="text-xs text-muted-foreground">{new Date(a.triggeredAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} • {a.peopleCount}</p>
                    </div>
                  </div>
                </div>
              ))}
              {data.alerts.length === 0 && (
                <p className="text-sm text-muted-foreground py-4 text-center">No alerts yet.</p>
              )}
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="mt-8">
        <Card className="border-slate-200">
          <CardHeader className="flex items-center justify-between">
            <CardTitle className="text-base">Recent Detection Jobs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-200 hover:bg-transparent">
                    <TableHead className="text-muted-foreground">Job</TableHead>
                    <TableHead className="text-muted-foreground">Status</TableHead>
                    <TableHead className="text-muted-foreground">People Max</TableHead>
                    <TableHead className="text-muted-foreground">Duration</TableHead>
                    <TableHead className="text-right text-muted-foreground">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.jobs.map((j) => (
                    <TableRow key={j.id} className="border-slate-200 hover:bg-blue-50/50">
                      <TableCell className="font-medium text-foreground">{j.name}</TableCell>
                      <TableCell>
                        <span className={"text-xs px-2.5 py-1 rounded-full font-medium " + (j.status === "completed" ? "bg-green-100 text-green-700" : j.status === "processing" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-700")}>{j.status}</span>
                      </TableCell>
                      <TableCell className="text-foreground">{j.maxPeople}</TableCell>
                      <TableCell className="text-foreground">{formatDuration(j.durationSeconds)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          {j.status === "completed" && j.videoUrl && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                              onClick={() => {
                                setSelectedVideo({ url: j.videoUrl!, name: j.name });
                                setVideoModalOpen(true);
                              }}
                            >
                              View Video
                            </Button>
                          )}
                          <Button asChild size="sm" variant="ghost" className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"><Link to={`/results?jobId=${j.id}`}>Open</Link></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {data.jobs.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                        No detection jobs yet. <Link to="/upload" className="text-blue-600 hover:underline">Start one</Link>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Live Processing Section */}
      <LiveProcessingSection />

      {/* Video Player Modal */}
      <Dialog open={videoModalOpen} onOpenChange={setVideoModalOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>{selectedVideo?.name || "Processed Video"}</DialogTitle>
          </DialogHeader>
          <div className="w-full">
            {selectedVideo && (
              <video
                controls
                autoPlay
                className="w-full rounded-lg"
                src={selectedVideo.url}
              >
                Your browser does not support the video tag.
              </video>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

function StatCard({ title, value, variant }: { title: string; value: string; variant?: "alert" }) {
  const getGradient = () => {
    if (variant === "alert") {
      return "bg-gradient-to-br from-red-400/20 to-orange-400/20 border-red-200/50";
    }
    return "bg-gradient-to-br from-blue-400/20 to-cyan-400/20 border-blue-200/50";
  };

  return (
    <Card className={`${getGradient()} border-2`}>
      <CardHeader>
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-4xl font-bold tracking-tight">{value}</p>
      </CardContent>
    </Card>
  );
}

function cnByLevel(level: AlertSummary["level"], base: string, icon = false) {
  if (level === "high") return base + (icon ? " text-red-600" : " bg-red-50/60 border-red-200/50");
  if (level === "medium") return base + (icon ? " text-amber-600" : " bg-amber-50/60 border-amber-200/50");
  return base + (icon ? " text-blue-600" : " bg-blue-50/60 border-blue-200/50");
}

function formatDuration(seconds: number): string {
  if (seconds === 0) return "—";
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

function LiveProcessingSection() {
  const [processingJobs, setProcessingJobs] = useState<any[]>([]);

  useEffect(() => {
    const fetchProcessingJobs = async () => {
      try {
        const response = await fetch("/api/dashboard/processing-jobs");
        if (response.ok) {
          const data = await response.json();
          setProcessingJobs(data.jobs || []);
        }
      } catch (error) {
        console.error("Failed to fetch processing jobs:", error);
      }
    };

    fetchProcessingJobs();
    const interval = setInterval(fetchProcessingJobs, 2000); // Poll every 2 seconds
    return () => clearInterval(interval);
  }, []);

  return (
    <section className="mt-8">
      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-base">Live Feed</CardTitle>
        </CardHeader>
        <CardContent>
          {processingJobs.length > 0 ? (
            <LiveProcessingBox jobs={processingJobs} />
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <p>No jobs currently processing.</p>
              <p className="text-sm mt-2">Upload a video to see live processing here.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
