import { useState, useEffect } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Pause, Play, AlertTriangle, Zap, XCircle, Monitor } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import type { DetectionJobSummary } from "@shared/api";
import { authHeaders } from "@/lib/auth";

export default function Live() {
  const [streamJobs, setStreamJobs] = useState<DetectionJobSummary[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string>("");
  const [isPaused, setIsPaused] = useState(false);
  const [liveData, setLiveData] = useState<{ time: string; count: number }[]>([]);
  const [currentCount, setCurrentCount] = useState(0);
  const [crowdLevel, setCrowdLevel] = useState("LOW");
  const [currentMax, setCurrentMax] = useState(0);
  const [threshold30, setThreshold30] = useState(0);
  const [threshold60, setThreshold60] = useState(0);
  const [streamFrame, setStreamFrame] = useState<string>("");
  const [alerts, setAlerts] = useState<{ id: string; time: string; zone: string; type: string; message: string }[]>([]);

  // Fetch all running jobs every 2 seconds
  useEffect(() => {
    const fetchStreamJobs = async () => {
      try {
        const apiUrl = import.meta.env.VITE_API_URL || "";
        const response = await fetch(`${apiUrl}/api/detection/jobs/streams`, {
          headers: authHeaders(),
        });
        if (!response.ok) throw new Error("Failed to fetch streams");
        const data = await response.json();
        setStreamJobs(data.jobs || []);
      } catch (error) {
        console.error("Failed to fetch stream jobs:", error);
      }
    };

    fetchStreamJobs();
    const interval = setInterval(fetchStreamJobs, 2000);
    return () => clearInterval(interval);
  }, []);

  // Auto-select a job when jobs change and nothing is selected
  useEffect(() => {
    if (!selectedJobId && streamJobs.length > 0) {
      const runningJob = streamJobs.find((j) => j.status === "running");
      setSelectedJobId(runningJob?.id || streamJobs[0].id);
    }
    // If selected job is no longer in the list, pick a new one
    if (selectedJobId && !streamJobs.find((j) => j.id === selectedJobId)) {
      const runningJob = streamJobs.find((j) => j.status === "running");
      setSelectedJobId(runningJob?.id || streamJobs[0]?.id || "");
    }
  }, [streamJobs, selectedJobId]);

  const activeJob = streamJobs.find((j) => j.id === selectedJobId) || streamJobs[0];

  // Update live frame for active job
  useEffect(() => {
    if (!activeJob || activeJob.status !== "running" || isPaused) {
      return;
    }

    const updateFrame = () => {
      const apiUrl = import.meta.env.VITE_API_URL || "";
      setStreamFrame(`${apiUrl}/api/detection/jobs/${activeJob.id}/stream?t=${Date.now()}`);
    };

    updateFrame();
    const interval = setInterval(updateFrame, 1000);
    return () => clearInterval(interval);
  }, [activeJob?.id, activeJob?.status, isPaused]);

  // Fetch live data from in-memory buffer (running jobs) or CSV (completed jobs)
  useEffect(() => {
    if (!activeJob) return;

    const fetchLiveData = async () => {
      // For running jobs, use the live-data endpoint (in-memory buffer, no disk I/O)
      if (activeJob.status === "running") {
        try {
          const apiUrl = import.meta.env.VITE_API_URL || "";
          const response = await fetch(`${apiUrl}/api/detection/jobs/${activeJob.id}/live-data`, {
            headers: authHeaders(),
          });
          if (response.ok) {
            const data = await response.json();
            setLiveData(data.chartData || []);
            setCurrentCount(data.currentCount || 0);
            setCrowdLevel(data.crowdLevel || "LOW");
            setCurrentMax(data.currentMax || 0);
            setThreshold30(data.threshold30 || 0);
            setThreshold60(data.threshold60 || 0);

            // Update alerts from live buffer
            if (data.alerts && data.alerts.length > 0) {
              setAlerts(data.alerts);
            }
            return;
          }
        } catch (error) {
          console.error("Failed to fetch live data:", error);
        }
      }

      // Fallback: parse CSV for completed/failed jobs or if live-data not available
      if (!activeJob?.artifacts?.csv) return;
      try {
        const apiUrl = import.meta.env.VITE_API_URL || "";
        // If the backend returns a relative URL for CSV, prepend the API URL
        const csvPath = activeJob.artifacts!.csv!.startsWith('/')
          ? `${apiUrl}${activeJob.artifacts!.csv!}`
          : activeJob.artifacts!.csv!;
        const response = await fetch(csvPath);
        if (!response.ok) return;

        const text = await response.text();
        const lines = text.trim().split("\n").slice(1);

        if (lines.length === 0) return;

        const recentLines = lines.slice(-30);
        const chartData = recentLines.map((line) => {
          const parts = line.split(",");
          const timestamp = parseFloat(parts[1]) || 0;
          const count = parseInt(parts[2]) || 0;

          const minutes = Math.floor(timestamp / 60);
          const seconds = Math.floor(timestamp % 60);
          const timeStr = `${minutes}:${seconds.toString().padStart(2, "0")}`;

          return { time: timeStr, count };
        });

        setLiveData(chartData);

        if (lines.length > 0) {
          const lastLine = lines[lines.length - 1];
          const parts = lastLine.split(",");
          const count = parseInt(parts[2]) || 0;
          const level = parts[4] || "LOW";
          const max = parseInt(parts[5]) || 0;
          const t30 = parseInt(parts[6]) || 0;
          const t60 = parseInt(parts[7]) || 0;
          setCurrentCount(count);
          setCrowdLevel(level);
          setCurrentMax(max);
          setThreshold30(t30);
          setThreshold60(t60);
        }
      } catch (error) {
        console.error("Failed to fetch CSV data:", error);
      }
    };

    fetchLiveData();
    const interval = setInterval(fetchLiveData, 2000);
    return () => clearInterval(interval);
  }, [activeJob?.id, activeJob?.status, activeJob?.artifacts?.csv]);

  const handleTerminate = async () => {
    if (!activeJob) return;

    if (confirm(`Are you sure you want to terminate job ${activeJob.id}?`)) {
      try {
        const apiUrl = import.meta.env.VITE_API_URL || "";
        const response = await fetch(`${apiUrl}/api/detection/jobs/${activeJob.id}/terminate`, {
          method: "POST",
          headers: authHeaders(),
        });

        if (response.ok) {
          alert("Job terminated successfully");
          setTimeout(async () => {
            const apiUrl = import.meta.env.VITE_API_URL || "";
            const jobsResponse = await fetch(`${apiUrl}/api/detection/jobs/streams`, {
              headers: authHeaders(),
            });
            if (jobsResponse.ok) {
              const data = await jobsResponse.json();
              setStreamJobs(data.jobs || []);
            }
          }, 1000); // Give backend a moment to update job status
        } else {
          const error = await response.json();
          alert(`Failed to terminate job: ${error.message}`);
        }
      } catch (error) {
        console.error("Failed to terminate job:", error);
        alert("Failed to terminate job. Please try again.");
      }
    }
  };

  const isRunning = activeJob?.status === "running" && !isPaused;

  const getLevelColor = (level: string) => {
    if (level === "HIGH") return { bg: "bg-red-500", text: "text-red-600", border: "border-red-200/50", gradient: "from-red-50/40 to-orange-50/40" };
    if (level === "MODERATE") return { bg: "bg-amber-500", text: "text-amber-600", border: "border-amber-200/50", gradient: "from-amber-50/40 to-yellow-50/40" };
    return { bg: "bg-green-500", text: "text-green-600", border: "border-green-200/50", gradient: "from-green-50/40 to-emerald-50/40" };
  };

  const levelColors = getLevelColor(crowdLevel);

  // Threshold bar percentage
  const thresholdPct = currentMax > 0 ? Math.min((currentCount / currentMax) * 100, 100) : 0;
  const t30Pct = currentMax > 0 ? (threshold30 / currentMax) * 100 : 30;
  const t60Pct = currentMax > 0 ? (threshold60 / currentMax) * 100 : 60;

  const getAlertBg = (type: string) => {
    if (type === "surge") return "bg-red-50/60 border-red-200/50 text-red-700";
    if (type === "rising") return "bg-amber-50/60 border-amber-200/50 text-amber-700";
    return "bg-blue-50/60 border-blue-200/50 text-blue-700";
  };

  const getAlertIcon = (type: string) => {
    if (type === "surge") return "🔴";
    if (type === "rising") return "🟡";
    return "🔵";
  };

  return (
    <AppLayout>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Live Monitoring</h1>
          <p className="mt-1 text-muted-foreground">Real-time people count and alert notifications</p>
        </div>

        {/* Job Switcher */}
        {streamJobs.length > 1 && (
          <div className="flex items-center gap-3">
            <Monitor className="h-4 w-4 text-muted-foreground" />
            <Select value={selectedJobId} onValueChange={setSelectedJobId}>
              <SelectTrigger className="w-[280px] border-slate-200/50 rounded-lg">
                <SelectValue placeholder="Select a stream" />
              </SelectTrigger>
              <SelectContent>
                {streamJobs.map((job) => (
                  <SelectItem value={job.id} key={job.id}>
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${job.status === "running" ? "bg-green-500 animate-pulse" : "bg-slate-400"}`} />
                      {job.sourceName}
                      <span className="text-xs text-muted-foreground">({job.sourceType})</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {!activeJob ? (
        <Card className="border-2 border-dashed border-slate-300">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <AlertTriangle className="h-16 w-16 text-slate-400 mb-4" />
            <h3 className="text-xl font-semibold text-slate-700 mb-2">No Active Streams</h3>
            <p className="text-muted-foreground text-center max-w-md">
              No processing jobs are currently running. Start a new detection job from the Upload page or with a
              stream URL to see live monitoring here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid lg:grid-cols-3 gap-6 mb-6">
          <div className="lg:col-span-2 space-y-6">
            <Card className="border-2 border-blue-200/50 bg-gradient-to-br from-blue-50/40 to-cyan-50/40">
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <div>
                  <CardTitle className="text-lg">Live Video Stream</CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {activeJob.sourceName} • {activeJob.sourceType}
                  </p>
                </div>
                <Badge variant={isRunning ? "default" : "secondary"} className="rounded-full">
                  {isRunning ? "🔴 LIVE" : "⏸ PAUSED"}
                </Badge>
              </CardHeader>
              <CardContent>
                <div className="relative bg-slate-900 rounded-2xl overflow-hidden border-2 border-slate-700 aspect-video flex items-center justify-center">
                  {activeJob.status === "running" && streamFrame ? (
                    <>
                      <img
                        src={streamFrame}
                        alt="Live stream"
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          e.currentTarget.src =
                            "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='300'%3E%3Crect fill='%23334155' width='400' height='300'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' fill='%23fff' font-size='16'%3ELoading...%3C/text%3E%3C/svg%3E";
                        }}
                      />
                      <button
                        onClick={handleTerminate}
                        className="absolute top-4 left-4 bg-red-600/90 hover:bg-red-700 text-white p-2 rounded-full transition-colors z-10"
                        title="Terminate stream"
                      >
                        <XCircle className="h-4 w-4" />
                      </button>
                    </>
                  ) : (
                    <div className="absolute inset-0 bg-gradient-to-br from-slate-800 to-slate-900 flex flex-col items-center justify-center">
                      <div className="text-white/50 text-center">
                        <div className="text-5xl mb-4">📹</div>
                        <p className="text-sm">Live stream preview</p>
                        <p className="text-xs text-white/30 mt-1">
                          {activeJob.status === "completed" ? "Stream completed" : "WebRTC/RTSP connection in progress"}
                        </p>
                      </div>
                    </div>
                  )}
                  {isRunning && (
                    <div className="absolute top-4 right-4 flex items-center gap-2 bg-red-600 text-white px-3 py-1.5 rounded-full text-xs font-medium animate-pulse">
                      <div className="w-2 h-2 bg-white rounded-full" />
                      RECORDING
                    </div>
                  )}
                </div>
                <div className="mt-6 flex gap-3">
                  <Button
                    className={`flex-1 rounded-lg font-semibold ${isPaused ? "bg-green-500 hover:bg-green-600" : "bg-red-500 hover:bg-red-600"
                      }`}
                    onClick={() => setIsPaused(!isPaused)}
                    disabled={activeJob.status !== "running"}
                  >
                    {isPaused ? (
                      <>
                        <Play className="h-4 w-4 mr-2" /> Resume Stream
                      </>
                    ) : (
                      <>
                        <Pause className="h-4 w-4 mr-2" /> Pause Stream
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="border-2 border-blue-200/50 bg-gradient-to-br from-blue-50/40 to-cyan-50/40">
              <CardHeader>
                <CardTitle className="text-base">People Count (live)</CardTitle>
              </CardHeader>
              <CardContent className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={liveData} margin={{ left: -20, right: 0 }}>
                    <defs>
                      <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
                    <XAxis dataKey="time" stroke="rgba(0,0,0,0.5)" />
                    <YAxis stroke="rgba(0,0,0,0.5)" />
                    <Tooltip
                      contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))" }}
                    />
                    {/* Dynamic threshold reference lines */}
                    {threshold30 > 0 && (
                      <ReferenceLine y={threshold30} stroke="#22c55e" strokeDasharray="6 3" label={{ value: `LOW ≤${threshold30}`, position: "right", fontSize: 10, fill: "#22c55e" }} />
                    )}
                    {threshold60 > 0 && (
                      <ReferenceLine y={threshold60} stroke="#f59e0b" strokeDasharray="6 3" label={{ value: `MOD ≤${threshold60}`, position: "right", fontSize: 10, fill: "#f59e0b" }} />
                    )}
                    <Area
                      type="monotone"
                      dataKey="count"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#colorCount)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            {/* Current Count */}
            <Card className={`border-2 ${levelColors.border} bg-gradient-to-br ${levelColors.gradient}`}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Current Count</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center">
                  <p className={`text-6xl font-bold ${levelColors.text}`}>{currentCount}</p>
                  <p className="text-muted-foreground text-sm mt-2">people detected</p>
                  <div className="mt-4 flex items-center justify-center gap-2 text-xs font-medium">
                    <Zap className={`h-3 w-3 ${levelColors.text}`} />
                    Last updated now
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Dynamic Threshold & Density */}
            <Card className="border-2 border-slate-200/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center justify-between">
                  <span>Crowd Density</span>
                  <Badge className={`rounded-full ${levelColors.bg} text-white`}>
                    {crowdLevel}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Threshold Bar */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>0</span>
                    <span>Dynamic Max: {currentMax}</span>
                  </div>
                  <div className="relative h-4 bg-slate-100 rounded-full overflow-hidden">
                    {/* Green zone */}
                    <div className="absolute inset-y-0 left-0 bg-green-200/60" style={{ width: `${t30Pct}%` }} />
                    {/* Yellow zone */}
                    <div className="absolute inset-y-0 bg-amber-200/60" style={{ left: `${t30Pct}%`, width: `${t60Pct - t30Pct}%` }} />
                    {/* Red zone */}
                    <div className="absolute inset-y-0 bg-red-200/60" style={{ left: `${t60Pct}%`, right: 0 }} />
                    {/* Current value indicator */}
                    <div
                      className={`absolute inset-y-0 ${levelColors.bg} rounded-full transition-all duration-500 ease-out opacity-80`}
                      style={{ width: `${thresholdPct}%` }}
                    />
                    {/* Threshold markers */}
                    <div className="absolute inset-y-0 w-0.5 bg-green-700/50" style={{ left: `${t30Pct}%` }} />
                    <div className="absolute inset-y-0 w-0.5 bg-amber-700/50" style={{ left: `${t60Pct}%` }} />
                  </div>
                  <div className="flex justify-between text-[10px] text-muted-foreground">
                    <span className="text-green-600">LOW (≤{threshold30})</span>
                    <span className="text-amber-600">MOD (≤{threshold60})</span>
                    <span className="text-red-600">HIGH</span>
                  </div>
                </div>

                {/* Stats */}
                <div className="space-y-2 pt-2 border-t">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Stream Status</span>
                    <Badge
                      className={`rounded-full ${isRunning ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-700"}`}
                    >
                      {isRunning ? "Connected" : "Paused"}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Dynamic Max</span>
                    <span className="font-semibold">{currentMax}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Source Type</span>
                    <span className="font-semibold capitalize">{activeJob.sourceType}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Live Alerts */}
            <Card className="border-2 border-slate-200/50">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-orange-600" />
                  Live Alerts
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {alerts.length > 0 ? (
                    alerts.map((alert) => (
                      <div key={alert.id} className={`rounded-lg border-2 p-3 ${getAlertBg(alert.type)}`}>
                        <div className="flex items-start gap-2">
                          <span className="text-lg">{getAlertIcon(alert.type)}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium">{alert.message}</p>
                            <p className="text-xs opacity-75 mt-0.5">
                              {alert.zone} • {alert.time}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-4 text-sm text-muted-foreground">No alerts at this time</div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
