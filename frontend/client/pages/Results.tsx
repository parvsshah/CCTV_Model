import { useEffect, useMemo, useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download } from "lucide-react";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { apiClient } from "@/lib/api";
import type { DetectionJobSummary, DetectionPredictionResponse } from "@shared/api";

// Mock data removed in favor of real API data

export default function Results() {
  const { toast } = useToast();
  const [jobs, setJobs] = useState<DetectionJobSummary[]>([]);
  const [selectedJobId, setSelectedJobId] = useState("");
  const [futureSteps, setFutureSteps] = useState(60);
  const [prediction, setPrediction] = useState<DetectionPredictionResponse | null>(null);
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [isPredicting, setIsPredicting] = useState(false);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [zoneStats, setZoneStats] = useState<any[]>([]);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const response = await apiClient.detection.list();
        if (!isMounted) return;
        setJobs(response.jobs);
        setSelectedJobId((prev) => prev || response.jobs[0]?.id || "");
      } catch (error) {
        console.error(error);
        toast({
          variant: "destructive",
          title: "Failed to load jobs",
          description: error instanceof Error ? error.message : "Unknown error",
        });
      } finally {
        if (isMounted) setLoadingJobs(false);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, [toast]);

  // Fetch dashboard stats (alerts and zone data)
  useEffect(() => {
    const fetchStats = async () => {
      try {
        const apiUrl = import.meta.env.VITE_API_URL || "";
        const response = await fetch(`${apiUrl}/api/dashboard/stats`);
        if (response.ok) {
          const data = await response.json();
          setAlerts(data.alerts || []);
          setZoneStats(data.zoneStats || []);
        }
      } catch (error) {
        console.error("Failed to fetch dashboard stats:", error);
      }
    };

    fetchStats();
    const interval = setInterval(fetchStats, 10000); // Update every 10s
    return () => clearInterval(interval);
  }, []);

  const activeJob = useMemo(() => {
    if (!selectedJobId) {
      return jobs[0];
    }
    return jobs.find((job) => job.id === selectedJobId) || jobs[0];
  }, [jobs, selectedJobId]);

function formatTime(timestamp: string): string {
  const num = Number(timestamp);
  if (!Number.isFinite(num)) return timestamp;
  const hours = Math.floor(num / 3600);
  const minutes = Math.floor((num % 3600) / 60);
  const seconds = Math.floor(num % 60);
  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

  const [historicalData, setHistoricalData] = useState<any[] | null>(null);

  useEffect(() => {
    setPrediction(null);
    setHistoricalData(null);
    
    if (activeJob?.artifacts?.csv) {
      const apiUrl = import.meta.env.VITE_API_URL || "";
      // If the backend returns a relative URL for CSV, prepend the API URL
      const csvPath = activeJob.artifacts.csv.startsWith('/') 
        ? `${apiUrl}${activeJob.artifacts.csv}`
        : activeJob.artifacts.csv;
      
      fetch(csvPath)
        .then((res) => {
          if (!res.ok) throw new Error("Failed to fetch CSV");
          return res.text();
        })
        .then((csvText) => {
          const lines = csvText.trim().split(/\r?\n/);
          if (lines.length <= 1) return;
          
          const data = [];
          for (const line of lines.slice(1)) {
            const parts = line.split(",");
            if (parts.length < 3) continue;
            
            const frame = Number(parts[0]);
            const timestamp = parts[1];
            const people = Number(parts[2]);
            
            if (!isNaN(frame) && !isNaN(people)) {
              data.push({
                frame,
                actual: people,
                predicted: people,
                isFuture: false,
                time: formatTime(timestamp),
              });
            }
          }
          setHistoricalData(data);
        })
        .catch(console.error);
    }
  }, [activeJob]);

  const timelineData = useMemo(() => {
    if (prediction) {
      return prediction.predictions.map((point) => ({
        frame: point.frameId,
        actual: point.actualCount,
        predicted: point.predictedCount,
        isFuture: point.actualCount === null,
      }));
    }
    if (historicalData && historicalData.length > 0) {
      return historicalData;
    }
    return []; // Return empty if no data
  }, [prediction, historicalData]);
  const jobStats = activeJob?.stats;
  const predictionStats = prediction?.stats;
  const predictionArtifacts = prediction?.artifacts ?? {
    csv: activeJob?.prediction?.csv,
    plot: activeJob?.prediction?.plot,
  };

  const handlePredict = async () => {
    if (!activeJob) {
      toast({
        variant: "destructive",
        title: "No job selected",
        description: "Run a detection job before predicting.",
      });
      return;
    }
    try {
      setIsPredicting(true);
      const future = Math.max(5, Math.min(500, Number(futureSteps) || 50));
      setFutureSteps(future);
      const response = await apiClient.detection.predict(activeJob.id, future);
      setPrediction(response);
      toast({
        title: "Prediction ready",
        description: `Generated ${response.stats.futureSteps} future data points.`,
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Prediction failed",
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setIsPredicting(false);
    }
  };

  const getAlertColor = (level: string) => {
    if (level === "high") return "bg-red-50/60 border-red-200/50";
    if (level === "medium") return "bg-amber-50/60 border-amber-200/50";
    return "bg-blue-50/60 border-blue-200/50";
  };

  const getAlertIcon = (level: string) => {
    if (level === "high") return "🔴";
    if (level === "medium") return "🟡";
    return "🔵";
  };

  return (
    <AppLayout>
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Analysis Results</h1>
        <p className="mt-2 text-muted-foreground">Detailed statistics and insights from your detection analysis</p>
      </div>

      {loadingJobs ? (
        <Card className="mb-6 border-slate-200/50">
          <CardContent className="py-6 text-sm text-muted-foreground">Loading detection jobs…</CardContent>
        </Card>
      ) : jobs.length === 0 ? (
        <Card className="mb-6 border-slate-200/50">
          <CardContent className="py-6 text-sm text-muted-foreground">
            No detection jobs available yet. Start a job from the Upload page to see analysis results.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-3 mb-6">
          <div>
            <p className="text-sm font-medium text-foreground mb-2">Detection Job</p>
            <Select value={activeJob?.id ?? ""} onValueChange={setSelectedJobId}>
              <SelectTrigger className="border-slate-200/50 rounded-lg">
                <SelectValue placeholder="Select a job" />
              </SelectTrigger>
              <SelectContent>
                {jobs.map((job) => (
                  <SelectItem value={job.id} key={job.id}>
                    {job.sourceName} • {job.status}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <p className="text-sm font-medium text-foreground mb-2">Future Steps</p>
            <Input
              type="number"
              min={5}
              max={500}
              value={futureSteps}
              onChange={(e) => setFutureSteps(Number(e.target.value))}
              className="border-slate-200/50 rounded-lg"
            />
            <p className="text-xs text-muted-foreground mt-1">Predict how many future frames to forecast.</p>
          </div>
          <div className="flex flex-col justify-end">
            <Button
              className="w-full bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 rounded-lg font-semibold"
              onClick={handlePredict}
              disabled={!activeJob || isPredicting}
            >
              {isPredicting ? "Running…" : "Run Prediction"}
            </Button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <Card className="border-2 border-blue-200/50 bg-gradient-to-br from-blue-50/40 to-cyan-50/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Average Detections</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-blue-600">
              {jobStats?.averagePeople 
                ? Math.round(jobStats.averagePeople).toLocaleString()
                : "—"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">{activeJob ? activeJob.sourceName : "No job selected"}</p>
          </CardContent>
        </Card>
        <Card className="border-2 border-orange-200/50 bg-gradient-to-br from-orange-50/40 to-red-50/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Peak Density</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-orange-600">{jobStats?.maxPeople ?? "—"}</p>
            <p className="text-xs text-muted-foreground mt-1">people in a single frame</p>
          </CardContent>
        </Card>
        <Card className="border-2 border-green-200/50 bg-gradient-to-br from-green-50/40 to-emerald-50/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Prediction Count</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-green-600">
              {prediction
                ? (() => {
                    const futurePredictions = prediction.predictions.filter(p => p.actualCount === null);
                    if (futurePredictions.length === 0) return "—";
                    const avg = futurePredictions.reduce((sum, p) => sum + (p.predictedCount ?? 0), 0) / futurePredictions.length;
                    return Math.round(avg).toLocaleString();
                  })()
                : "—"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">{prediction ? "avg predicted people" : "run prediction to view"}</p>
          </CardContent>
        </Card>
        <Card className="border-2 border-purple-200/50 bg-gradient-to-br from-purple-50/40 to-pink-50/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Future Steps</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-purple-600">{predictionStats?.futureSteps ?? futureSteps}</p>
            <p className="text-xs text-muted-foreground mt-1">frames forecast</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid lg:grid-cols-3 gap-6 mb-6">
        <div className="lg:col-span-2 space-y-6">
          <Card className="border-2 border-blue-200/50 bg-gradient-to-br from-blue-50/40 to-cyan-50/40">
            <CardHeader>
              <CardTitle className="text-base">People Count Timeline</CardTitle>
            </CardHeader>
            <CardContent className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={timelineData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
                  <XAxis dataKey="frame" stroke="rgba(0,0,0,0.5)" />
                  <YAxis stroke="rgba(0,0,0,0.5)" />
                  <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))" }} />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="actual"
                    name="Actual"
                    stroke="#22c55e"
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                  />
                  <Line
                    type="monotone"
                    dataKey="predicted"
                    name="Predicted"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="border-2 border-slate-200/50">
            <CardHeader>
              <CardTitle className="text-base">Recent Alerts</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2.5">
                {alerts.length > 0 ? (
                  alerts.map((alert) => (
                    <div key={alert.id} className={`flex items-center justify-between rounded-lg border-2 p-3 ${getAlertColor(alert.level)}`}>
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <span className="text-lg">{getAlertIcon(alert.level)}</span>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground">{alert.message}</p>
                          <p className="text-xs text-muted-foreground">
                            {alert.zone} at {new Date(alert.triggeredAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • {alert.peopleCount} people
                          </p>
                        </div>
                      </div>
                      <span className={`text-xs px-3 py-1 rounded-full font-medium ${alert.level === "high" ? "bg-red-200/50 text-red-700" : alert.level === "medium" ? "bg-amber-200/50 text-amber-700" : "bg-blue-200/50 text-blue-700"}`}>
                        {alert.level.toUpperCase()}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8 text-muted-foreground text-sm italic">
                    No recent alerts recorded.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="border-2 border-slate-200/50">
            <CardHeader>
              <CardTitle className="text-base">Zone Distribution</CardTitle>
            </CardHeader>
            <CardContent className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                {zoneStats.length > 0 ? (
                  <PieChart>
                    <Pie
                      data={zoneStats}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, value }) => `${name}: ${value}`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {zoneStats.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => `${value} people detections`} />
                  </PieChart>
                ) : (
                  <div className="flex items-center justify-center h-full text-sm text-muted-foreground italic">
                    Insufficient data for zone analysis.
                  </div>
                )}
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="border-2 border-slate-200/50">
            <CardHeader>
              <CardTitle className="text-base">Export Results</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {activeJob?.artifacts?.csv ? (
                <Button className="w-full rounded-lg justify-start" variant="outline" asChild>
                  <a href={activeJob.artifacts.csv} target="_blank" rel="noreferrer">
                    <Download className="h-4 w-4 mr-2" /> Download detection CSV
                  </a>
                </Button>
              ) : (
                <p className="text-sm text-muted-foreground">Detection CSV not available yet.</p>
              )}
              {predictionArtifacts?.csv && (
                <Button className="w-full rounded-lg justify-start" variant="outline" asChild>
                  <a href={predictionArtifacts.csv} target="_blank" rel="noreferrer">
                    <Download className="h-4 w-4 mr-2" /> Prediction CSV
                  </a>
                </Button>
              )}
              {predictionArtifacts?.plot && (
                <Button className="w-full rounded-lg justify-start" variant="outline" asChild>
                  <a href={predictionArtifacts.plot} target="_blank" rel="noreferrer">
                    <Download className="h-4 w-4 mr-2" /> Prediction chart
                  </a>
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
