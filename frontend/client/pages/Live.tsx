import { useState, useEffect } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Pause, Play, AlertTriangle, Zap, XCircle } from "lucide-react";
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import type { DetectionJobSummary } from "@shared/api";

export default function Live() {
  const [streamJobs, setStreamJobs] = useState<DetectionJobSummary[]>([]);
  const [isPaused, setIsPaused] = useState(false);
  const [liveData, setLiveData] = useState<{ time: string; count: number }[]>([]);
  const [currentCount, setCurrentCount] = useState(0);
  const [streamFrame, setStreamFrame] = useState<string>("");
  const [alerts, setAlerts] = useState<{ id: string; time: string; zone: string; type: string; message: string }[]>([]);

  // Fetch stream jobs every 2 seconds
  useEffect(() => {
    const fetchStreamJobs = async () => {
      try {
        const response = await fetch("/api/detection/jobs/streams");
        if (response.ok) {
          const data = await response.json();
          setStreamJobs(data.jobs || []);
        }
      } catch (error) {
        console.error("Failed to fetch stream jobs:", error);
      }
    };

    fetchStreamJobs();
    const interval = setInterval(fetchStreamJobs, 2000);
    return () => clearInterval(interval);
  }, []);

  // Get the first running job for display
  const activeJob = streamJobs.find((j) => j.status === "running") || streamJobs[0];

  // Update live frame for active job
  useEffect(() => {
    if (!activeJob || activeJob.status !== "running" || isPaused) {
      return;
    }

    const updateFrame = () => {
      setStreamFrame(`/api/detection/jobs/${activeJob.id}/stream?t=${Date.now()}`);
    };

    updateFrame();
    const interval = setInterval(updateFrame, 1000);
    return () => clearInterval(interval);
  }, [activeJob?.id, activeJob?.status, isPaused]);

  // Fetch and update CSV data for chart
  useEffect(() => {
    if (!activeJob?.artifacts?.csv) return;

    const fetchCsvData = async () => {
      try {
        const response = await fetch(activeJob.artifacts!.csv!);
        if (!response.ok) return;

        const text = await response.text();
        const lines = text.trim().split("\n").slice(1);

        if (lines.length === 0) return;

        // Get last 12 data points for the chart
        const recentLines = lines.slice(-12);
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

        // Update current count from the latest entry
        if (lines.length > 0) {
          const lastLine = lines[lines.length - 1];
          const parts = lastLine.split(",");
          const count = parseInt(parts[2]) || 0;
          setCurrentCount(count);
        }
      } catch (error) {
        console.error("Failed to fetch CSV data:", error);
      }
    };

    fetchCsvData();
    const interval = setInterval(fetchCsvData, 2000);
    return () => clearInterval(interval);
  }, [activeJob?.artifacts?.csv]);

  const handleTerminate = async () => {
    if (!activeJob) return;

    if (confirm(`Are you sure you want to terminate job ${activeJob.id}?`)) {
      try {
        const response = await fetch(`/api/detection/jobs/${activeJob.id}/terminate`, {
          method: "POST",
        });

        if (response.ok) {
          alert("Job terminated successfully");
          const jobsResponse = await fetch("/api/detection/jobs/streams");
          if (jobsResponse.ok) {
            const data = await jobsResponse.json();
            setStreamJobs(data.jobs || []);
          }
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
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Live Monitoring</h1>
        <p className="mt-2 text-muted-foreground">Real-time people count and alert notifications</p>
      </div>

      {!activeJob ? (
        <Card className="border-2 border-dashed border-slate-300">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <AlertTriangle className="h-16 w-16 text-slate-400 mb-4" />
            <h3 className="text-xl font-semibold text-slate-700 mb-2">No Active Streams</h3>
            <p className="text-muted-foreground text-center max-w-md">
              No stream processing jobs are currently running. Start a new detection job with a YouTube live link or
              RTSP stream to see live monitoring here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid lg:grid-cols-3 gap-6 mb-6">
          <div className="lg:col-span-2 space-y-6">
            <Card className="border-2 border-blue-200/50 bg-gradient-to-br from-blue-50/40 to-cyan-50/40">
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <CardTitle className="text-lg">Live Video Stream</CardTitle>
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
                      {/* Terminate button in top-left corner */}
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
                <CardTitle className="text-base">People Count (last 15 min)</CardTitle>
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
            <Card className="border-2 border-orange-200/50 bg-gradient-to-br from-orange-50/40 to-red-50/40">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Current Count</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center">
                  <p className="text-6xl font-bold text-orange-600">{currentCount}</p>
                  <p className="text-muted-foreground text-sm mt-2">people detected</p>
                  <div className="mt-4 flex items-center justify-center gap-2 text-xs font-medium">
                    <Zap className="h-3 w-3 text-orange-600" />
                    Last updated now
                  </div>
                </div>
              </CardContent>
            </Card>

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

            <Card className="border-2 border-slate-200/50">
              <CardHeader>
                <CardTitle className="text-base">Status</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Stream Status</span>
                  <Badge
                    className={`rounded-full ${isRunning ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-700"
                      }`}
                  >
                    {isRunning ? "Connected" : "Paused"}
                  </Badge>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">FPS</span>
                  <span className="font-semibold">30</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Latency</span>
                  <span className="font-semibold">45ms</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
