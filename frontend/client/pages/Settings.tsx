import { useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, Bell, LogOut, Save, Mail } from "lucide-react";

export default function Settings() {
  const [notifications, setNotifications] = useState(true);
  const [emailAlerts, setEmailAlerts] = useState(false);
  const [alertThreshold, setAlertThreshold] = useState(80);
  const [theme, setTheme] = useState("light");
  const [apiKey, setApiKey] = useState("sk_live_••••••••••••••••••••••••");
  const [showApiKey, setShowApiKey] = useState(false);

  const handleSave = () => {
    alert("Settings saved successfully!");
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

          <Card className="border-2 border-slate-200/50">
            <CardHeader>
              <CardTitle className="text-lg">Appearance</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-3">Theme</label>
                <Select value={theme} onValueChange={setTheme}>
                  <SelectTrigger className="border-slate-200/50 rounded-lg">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="light">Light</SelectItem>
                    <SelectItem value="dark">Dark</SelectItem>
                    <SelectItem value="auto">Auto (System)</SelectItem>
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
                <Input type="number" placeholder="100" defaultValue="100" className="border-slate-200/50 rounded-lg" />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">Default Alert Threshold</label>
                <Input type="number" placeholder="80" defaultValue="80" className="border-slate-200/50 rounded-lg" />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">Default Confidence Level</label>
                <Input type="number" placeholder="70" defaultValue="70" className="border-slate-200/50 rounded-lg" />
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
                    className="border-slate-200/50 rounded-lg bg-slate-50"
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

          <Card className="border-2 border-slate-200/50">
            <CardHeader>
              <CardTitle className="text-lg">Danger Zone</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button className="w-full border-red-200/50 rounded-lg text-red-600 hover:bg-red-50" variant="outline">
                <LogOut className="h-4 w-4 mr-2" /> Sign Out
              </Button>
              <Button className="w-full border-red-200/50 rounded-lg text-red-600 hover:bg-red-50" variant="outline">
                Delete Account
              </Button>
            </CardContent>
          </Card>
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
