import { useState, useEffect } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Pause, Play, AlertTriangle, Zap } from "lucide-react";
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

const generateLiveData = () => Array.from({ length: 12 }, (_, i) => ({
  time: `${Math.floor(Date.now() / 60000) - 11 + i}:00`,
  count: Math.round(10 + Math.random() * 60),
}));

export default function Live() {
  const [isRunning, setIsRunning] = useState(true);
  const [liveData, setLiveData] = useState(generateLiveData());
  const [currentCount, setCurrentCount] = useState(45);
  const [alerts, setAlerts] = useState([
    { id: "1", time: "Just now", zone: "Central Area", type: "surge", message: "Crowd surge detected" },
    { id: "2", time: "2 min ago", zone: "Entry Point", type: "rising", message: "Density rising rapidly" },
    { id: "3", time: "5 min ago", zone: "Exit Corridor", type: "warning", message: "Nearing capacity threshold" },
  ]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (isRunning) {
        setCurrentCount(Math.round(20 + Math.random() * 80));
        setLiveData((prev) => {
          const newData = [...prev.slice(1)];
          newData.push({
            time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            count: Math.round(10 + Math.random() * 60),
          });
          return newData;
        });

        if (Math.random() > 0.8) {
          const types = ["surge", "rising", "warning"];
          const zones = ["Central Area", "Entry Point", "Exit Corridor"];
          const messages = ["Crowd surge detected", "Density rising rapidly", "Nearing capacity threshold"];
          const idx = Math.floor(Math.random() * 3);

          setAlerts((prev) => [
            {
              id: Date.now().toString(),
              time: "Just now",
              zone: zones[idx],
              type: types[idx],
              message: messages[idx],
            },
            ...prev.slice(0, 2),
          ]);
        }
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [isRunning]);

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
                <div className="absolute inset-0 bg-gradient-to-br from-slate-800 to-slate-900 flex flex-col items-center justify-center">
                  <div className="text-white/50 text-center">
                    <div className="text-5xl mb-4">📹</div>
                    <p className="text-sm">Live stream preview</p>
                    <p className="text-xs text-white/30 mt-1">WebRTC/RTSP connection in progress</p>
                  </div>
                </div>
                {isRunning && (
                  <div className="absolute top-4 right-4 flex items-center gap-2 bg-red-600 text-white px-3 py-1.5 rounded-full text-xs font-medium animate-pulse">
                    <div className="w-2 h-2 bg-white rounded-full" />
                    RECORDING
                  </div>
                )}
              </div>
              <div className="mt-6 flex gap-3">
                <Button
                  className={`flex-1 rounded-lg font-semibold ${isRunning ? "bg-red-500 hover:bg-red-600" : "bg-green-500 hover:bg-green-600"}`}
                  onClick={() => setIsRunning(!isRunning)}
                >
                  {isRunning ? (
                    <>
                      <Pause className="h-4 w-4 mr-2" /> Pause Stream
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4 mr-2" /> Resume Stream
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
                  <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))" }} />
                  <Area type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#colorCount)" />
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
                {alerts.map((alert) => (
                  <div key={alert.id} className={`rounded-lg border-2 p-3 ${getAlertBg(alert.type)}`}>
                    <div className="flex items-start gap-2">
                      <span className="text-lg">{getAlertIcon(alert.type)}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{alert.message}</p>
                        <p className="text-xs opacity-75 mt-0.5">{alert.zone} • {alert.time}</p>
                      </div>
                    </div>
                  </div>
                ))}
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
                <Badge className={`rounded-full ${isRunning ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-700"}`}>
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
    </AppLayout>
  );
}
