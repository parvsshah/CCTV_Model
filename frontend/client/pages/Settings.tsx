import { useState, useEffect } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { AlertTriangle, Bell, LogOut, Save, Mail, BarChart3 } from "lucide-react";
import { DetectionViewMode, TimeRange, UserPreferences } from "@shared/api";
import { useToast } from "@/hooks/use-toast";

export default function Settings() {
  const { toast } = useToast();

  // Settings state
  const [notifications, setNotifications] = useState(true);
  const [emailAlerts, setEmailAlerts] = useState(false);
  const [alertThreshold, setAlertThreshold] = useState(80);
  const [theme, setTheme] = useState<"light" | "dark" | "system">("light");
  const [apiKey, setApiKey] = useState("sk_live_••••••••••••••••••••••••");
  const [showApiKey, setShowApiKey] = useState(false);

  // Detection preferences
  const [detectionViewMode, setDetectionViewMode] = useState<DetectionViewMode>("average");
  const [timeRange, setTimeRange] = useState<TimeRange>("2hours");
  
  // Detection defaults
  const [defaultMaxCapacity, setDefaultMaxCapacity] = useState(100);
  const [defaultAlertThreshold, setDefaultAlertThreshold] = useState(80);
  const [defaultConfidenceLevel, setDefaultConfidenceLevel] = useState(70);

  // Load preferences from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem("crowdDetectionPreferences");
      if (saved) {
        const prefs: UserPreferences = JSON.parse(saved);
        setDetectionViewMode(prefs.detectionViewMode);
        setTimeRange(prefs.timeRange);
        if (prefs.theme) setTheme(prefs.theme as any);
        if (prefs.defaultMaxCapacity) setDefaultMaxCapacity(prefs.defaultMaxCapacity);
        if (prefs.defaultAlertThreshold) setDefaultAlertThreshold(prefs.defaultAlertThreshold);
        if (prefs.defaultConfidenceLevel) setDefaultConfidenceLevel(prefs.defaultConfidenceLevel);
      }
    } catch (error) {
      console.error("Failed to load preferences:", error);
    }
  }, []);

  const handleSave = () => {
    try {
      // Save preferences to localStorage
      const preferences: UserPreferences = {
        detectionViewMode,
        timeRange,
        theme,
        defaultMaxCapacity,
        defaultAlertThreshold,
        defaultConfidenceLevel,
      };
      localStorage.setItem("crowdDetectionPreferences", JSON.stringify(preferences));

      // Apply theme immediately
      if (theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches)) {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }

      toast({
        title: "Settings saved",
        description: "Your preferences have been updated successfully.",
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Failed to save",
        description: "Could not save your preferences. Please try again.",
      });
    }
  };

  const handlePhotoUpload = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      const formData = new FormData();
      formData.append("photo", file);

      try {
        const response = await fetch("/api/user/profile-photo", {
          method: "POST",
          body: formData,
        });

        if (response.ok) {
          toast({
            title: "Photo updated",
            description: "Your profile photo has been updated successfully.",
          });
          // Optionally refresh profile data here
        } else {
          throw new Error("Failed to upload");
        }
      } catch (error) {
        toast({
          variant: "destructive",
          title: "Upload failed",
          description: "Could not upload your profile photo. Please try again.",
        });
      }
    };
    input.click();
  };

  return (
    <AppLayout>
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Settings</h1>
        <p className="mt-2 text-muted-foreground">Manage your account, preferences, and detection parameters</p>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card className="border-2 border-blue-200/50 bg-gradient-to-br from-blue-50/40 to-cyan-50/40">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Bell className="h-5 w-5 text-blue-600" />
                Notifications & Alerts
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between pb-4 border-b border-blue-200/30">
                <div>
                  <p className="font-medium text-foreground">Push Notifications</p>
                  <p className="text-sm text-muted-foreground mt-1">Receive alerts on your device</p>
                </div>
                <Switch checked={notifications} onCheckedChange={setNotifications} />
              </div>

              <div className="flex items-center justify-between pb-4 border-b border-blue-200/30">
                <div>
                  <p className="font-medium text-foreground">Email Alerts</p>
                  <p className="text-sm text-muted-foreground mt-1">Get email notifications for critical events</p>
                </div>
                <Switch checked={emailAlerts} onCheckedChange={setEmailAlerts} />
              </div>

              <div>
                <label className="block mb-3">
                  <p className="font-medium text-foreground">Alert Sensitivity</p>
                  <p className="text-sm text-muted-foreground mt-1">Lower values = more frequent alerts</p>
                </label>
                <div className="flex items-center gap-4">
                  <Slider value={[alertThreshold]} min={10} max={100} step={5} onValueChange={(v) => setAlertThreshold(v[0])} className="flex-1" />
                  <span className="text-sm font-semibold text-blue-600 min-w-fit">{alertThreshold}%</span>
                </div>
              </div>

              <div className="bg-blue-100/30 border border-blue-200/50 rounded-lg p-4 flex gap-3">
                <AlertTriangle className="h-4 w-4 text-blue-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-foreground">Critical alerts (high severity) will always be sent, regardless of sensitivity settings.</p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-2 border-purple-200/50 bg-gradient-to-br from-purple-50/40 to-pink-50/40">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-purple-600" />
                Detection Display Preferences
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">Configure how crowd metrics are displayed on the dashboard</p>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <Label className="text-sm font-medium text-foreground mb-3 block">Detection Count Display</Label>
                <RadioGroup value={detectionViewMode} onValueChange={(v) => setDetectionViewMode(v as DetectionViewMode)}>
                  <div className="flex items-center space-x-2 mb-2">
                    <RadioGroupItem value="average" id="average" />
                    <Label htmlFor="average" className="font-normal cursor-pointer">
                      Average Count (Recommended)
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="total" id="total" />
                    <Label htmlFor="total" className="font-normal cursor-pointer">
                      Total Count (Sum of all frames)
                    </Label>
                  </div>
                </RadioGroup>
                <p className="text-xs text-muted-foreground mt-2">
                  Average count normalizes detections by dividing total by number of frames, providing a more accurate representation.
                </p>
              </div>

              <div>
                <Label className="text-sm font-medium text-foreground mb-3 block">Time Range for Dashboard</Label>
                <Select value={timeRange} onValueChange={(v) => setTimeRange(v as TimeRange)}>
                  <SelectTrigger className="border-purple-200/50 rounded-lg">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="30min">Last 30 minutes</SelectItem>
                    <SelectItem value="1hour">Last 1 hour</SelectItem>
                    <SelectItem value="2hours">Last 2 hours</SelectItem>
                    <SelectItem value="3hours">Last 3 hours</SelectItem>
                    <SelectItem value="5hours">Last 5 hours</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-2">
                  Choose the time window for dashboard metrics and charts.
                </p>
              </div>

              <div className="bg-purple-100/30 border border-purple-200/50 rounded-lg p-4 flex gap-3">
                <AlertTriangle className="h-4 w-4 text-purple-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-foreground">Changes will apply immediately after saving and refreshing the dashboard.</p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-2 border-slate-200/50">
            <CardHeader>
              <CardTitle className="text-lg">Appearance</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-3">Theme</label>
                <Select value={theme} onValueChange={(v) => setTheme(v as any)}>
                  <SelectTrigger className="border-slate-200/50 rounded-lg">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="light">Light</SelectItem>
                    <SelectItem value="dark">Dark</SelectItem>
                    <SelectItem value="system">Auto (System)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card className="border-2 border-slate-200/50">
            <CardHeader>
              <CardTitle className="text-lg">Detection Defaults</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">Default Maximum Capacity</label>
                <Input type="number" value={defaultMaxCapacity} onChange={(e) => setDefaultMaxCapacity(Number(e.target.value))} className="border-slate-200/50 rounded-lg" />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">Default Alert Threshold</label>
                <Input type="number" value={defaultAlertThreshold} onChange={(e) => setDefaultAlertThreshold(Number(e.target.value))} className="border-slate-200/50 rounded-lg" />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">Default Confidence Level</label>
                <Input type="number" value={defaultConfidenceLevel} onChange={(e) => setDefaultConfidenceLevel(Number(e.target.value))} className="border-slate-200/50 rounded-lg" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-2 border-slate-200/50">
            <CardHeader>
              <CardTitle className="text-lg">API Configuration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">API Key</label>
                <div className="flex gap-2">
                  <Input
                    type={showApiKey ? "text" : "password"}
                    value={apiKey}
                    readOnly
                    className="border-slate-200/50 rounded-lg bg-slate-50 dark:bg-slate-900"
                  />
                  <Button
                    variant="outline"
                    className="border-slate-200/50 rounded-lg"
                    onClick={() => setShowApiKey(!showApiKey)}
                  >
                    {showApiKey ? "Hide" : "Show"}
                  </Button>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1 border-slate-200/50 rounded-lg">
                  Copy Key
                </Button>
                <Button variant="outline" className="flex-1 border-slate-200/50 rounded-lg">
                  Regenerate
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="border-2 border-orange-200/50 bg-gradient-to-br from-orange-50/40 to-red-50/40">
            <CardHeader>
              <CardTitle className="text-lg">Profile</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col items-center mb-4">
                 <div className="h-24 w-24 rounded-full bg-slate-200 flex items-center justify-center overflow-hidden border-2 border-orange-200 mb-4">
                    <img src="/api/user/profile-photo" alt="Profile" className="h-full w-full object-cover" onError={(e) => {
                      (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=User&background=random`;
                    }} />
                 </div>
                 <Button onClick={handlePhotoUpload} variant="outline" size="sm" className="rounded-lg">
                    Upload Photo
                 </Button>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-2">Email Address</p>
                <p className="font-medium text-foreground">user@example.com</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-2">Plan</p>
                <p className="font-medium text-foreground">Professional</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-2">Member Since</p>
                <p className="font-medium text-foreground">Jan 15, 2024</p>
              </div>
              <Button className="w-full border-orange-200/50 rounded-lg text-orange-600 hover:bg-orange-50" variant="outline">
                <Mail className="h-4 w-4 mr-2" /> Change Email
              </Button>
            </CardContent>
          </Card>

          <Card className="border-2 border-slate-200/50">
            <CardHeader>
              <CardTitle className="text-lg">Connected Services</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-foreground text-sm">GitHub</p>
                  <p className="text-xs text-muted-foreground">Connected</p>
                </div>
                <span className="text-xs font-medium text-green-600 bg-green-100/50 px-2 py-1 rounded-full">✓</span>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-3 pt-2">
            <Button className="w-full border-red-200/50 rounded-lg text-red-600 hover:bg-red-50" variant="outline">
              <LogOut className="h-4 w-4 mr-2" /> Sign Out
            </Button>
            <Button className="w-full border-red-200/50 rounded-lg text-red-600 hover:bg-red-50" variant="outline">
              Delete Account
            </Button>
          </div>
        </div>
      </div>

      <div className="mt-8 flex justify-end">
        <Button className="bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 rounded-lg font-semibold px-8" onClick={handleSave}>
          <Save className="h-4 w-4 mr-2" /> Save Changes
        </Button>
      </div>
    </AppLayout>
  );
}
