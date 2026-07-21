import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
    Activity,
    ChevronLeft,
    ChevronRight,
    Loader2,
    Monitor,
    Search,
    Settings,
    Shield,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "../components/ui/table";
import { Textarea } from "../components/ui/textarea";
import { sebService, type SebSettings } from "../services/seb";
import {
    systemService,
    type UpdatePolicyInput,
    type UpdateSettingInput,
} from "../services/system";

type Tab = "settings" | "policies" | "health" | "seb";

export default function SystemSettingsPage() {
  const [tab, setTab] = useState<Tab>("settings");
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [search, setSearch] = useState("");
  const [editingSetting, setEditingSetting] = useState<string | null>(null);
  const [editingPolicy, setEditingPolicy] = useState<string | null>(null);
  const [settingValue, setSettingValue] = useState("");
  const [settingDesc, setSettingDesc] = useState("");
  const [policyJson, setPolicyJson] = useState("");
  const [policyActive, setPolicyActive] = useState(true);
  const queryClient = useQueryClient();

  const settingsQuery = useQuery({
    queryKey: ["system-settings", page, pageSize, search],
    queryFn: () =>
      systemService.listSettings({
        page,
        pageSize,
        search: search || undefined,
      }),
    enabled: tab === "settings",
  });

  const policiesQuery = useQuery({
    queryKey: ["security-policies", page, pageSize, search],
    queryFn: () =>
      systemService.listPolicies({
        page,
        pageSize,
        search: search || undefined,
      }),
    enabled: tab === "policies",
  });

  const healthQuery = useQuery({
    queryKey: ["health-detailed"],
    queryFn: () => systemService.healthDetailed(),
    enabled: tab === "health",
    refetchInterval: 5000,
  });

  const updateSettingMutation = useMutation({
    mutationFn: ({ key, data }: { key: string; data: UpdateSettingInput }) =>
      systemService.updateSetting(key, data),
    onSuccess: () => {
      toast.success("Setting updated successfully");
      queryClient.invalidateQueries({ queryKey: ["system-settings"] });
      setEditingSetting(null);
    },
    onError: () => toast.error("Failed to update setting"),
  });

  const updatePolicyMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdatePolicyInput }) =>
      systemService.updatePolicy(id, data),
    onSuccess: () => {
      toast.success("Security policy updated successfully");
      queryClient.invalidateQueries({ queryKey: ["security-policies"] });
      setEditingPolicy(null);
    },
    onError: () => toast.error("Failed to update security policy"),
  });

  const handleEditSetting = (
    key: string,
    currentValue: string,
    currentDesc: string | null,
  ) => {
    setEditingSetting(key);
    setSettingValue(currentValue);
    setSettingDesc(currentDesc ?? "");
  };

  const handleSaveSetting = () => {
    if (!editingSetting) return;
    updateSettingMutation.mutate({
      key: editingSetting,
      data: { value: settingValue, description: settingDesc || undefined },
    });
  };

  const handleEditPolicy = (
    id: string,
    json: Record<string, unknown>,
    isActive: boolean,
  ) => {
    setEditingPolicy(id);
    setPolicyJson(JSON.stringify(json, null, 2));
    setPolicyActive(isActive);
  };

  const handleSavePolicy = () => {
    if (!editingPolicy) return;
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(policyJson);
    } catch {
      toast.error("Invalid JSON format");
      return;
    }
    updatePolicyMutation.mutate({
      id: editingPolicy,
      data: { settingsJson: parsed, isActive: policyActive },
    });
  };

  const totalPages = (data: { total: number } | undefined) =>
    data ? Math.ceil(data.total / pageSize) : 1;

  return (
    <div className="space-y-4">
      <div className="flex gap-2 border-b">
        <Button
          variant={tab === "settings" ? "default" : "ghost"}
          size="sm"
          onClick={() => setTab("settings")}
        >
          <Settings className="mr-2 h-4 w-4" />
          Settings
        </Button>
        <Button
          variant={tab === "policies" ? "default" : "ghost"}
          size="sm"
          onClick={() => setTab("policies")}
        >
          <Shield className="mr-2 h-4 w-4" />
          Security Policies
        </Button>
        <Button
          variant={tab === "health" ? "default" : "ghost"}
          size="sm"
          onClick={() => setTab("health")}
        >
          <Activity className="mr-2 h-4 w-4" />
          Health
        </Button>
        <Button
          variant={tab === "seb" ? "default" : "ghost"}
          size="sm"
          onClick={() => setTab("seb")}
        >
          <Monitor className="mr-2 h-4 w-4" />
          SEB Settings
        </Button>
      </div>

      {(tab === "settings" || tab === "policies") && (
        <div className="relative max-w-sm">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="pl-8"
          />
        </div>
      )}

      {tab === "settings" && (
        <>
          {settingsQuery.isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Key</TableHead>
                      <TableHead>Value</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Editable</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {settingsQuery.data?.data.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={6}
                          className="text-center text-muted-foreground py-8"
                        >
                          No settings found
                        </TableCell>
                      </TableRow>
                    ) : (
                      settingsQuery.data?.data.map((s) => (
                        <TableRow key={s.id}>
                          <TableCell className="font-mono text-sm font-medium">
                            {s.key}
                          </TableCell>
                          <TableCell className="font-mono text-sm">
                            {s.value}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{s.valueType}</Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {s.description ?? "-"}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={s.isEditable ? "default" : "secondary"}
                            >
                              {s.isEditable ? "Yes" : "No"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={!s.isEditable}
                              onClick={() =>
                                handleEditSetting(s.key, s.value, s.description)
                              }
                            >
                              Edit
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
              <Pagination
                page={page}
                totalPages={totalPages(settingsQuery.data)}
                onPageChange={setPage}
                total={settingsQuery.data?.total ?? 0}
              />
            </>
          )}
        </>
      )}

      {tab === "policies" && (
        <>
          {policiesQuery.isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Policy Name</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Settings</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {policiesQuery.data?.data.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={5}
                          className="text-center text-muted-foreground py-8"
                        >
                          No security policies found
                        </TableCell>
                      </TableRow>
                    ) : (
                      policiesQuery.data?.data.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell className="font-medium">
                            {p.policyName}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {p.description ?? "-"}
                          </TableCell>
                          <TableCell className="text-sm font-mono">
                            {JSON.stringify(p.settingsJson).slice(0, 60)}
                            {JSON.stringify(p.settingsJson).length > 60
                              ? "..."
                              : ""}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={p.isActive ? "default" : "secondary"}
                            >
                              {p.isActive ? "Active" : "Inactive"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                handleEditPolicy(
                                  p.id,
                                  p.settingsJson,
                                  p.isActive,
                                )
                              }
                            >
                              Edit
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
              <Pagination
                page={page}
                totalPages={totalPages(policiesQuery.data)}
                onPageChange={setPage}
                total={policiesQuery.data?.total ?? 0}
              />
            </>
          )}
        </>
      )}

      {tab === "health" && (
        <>
          {healthQuery.isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : healthQuery.data ? (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-lg border p-4">
                <h3 className="mb-3 text-lg font-semibold">Database</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Status</span>
                    <Badge
                      variant={
                        healthQuery.data.database.status === "ok"
                          ? "default"
                          : "destructive"
                      }
                    >
                      {healthQuery.data.database.status}
                    </Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Latency</span>
                    <span className="font-mono">
                      {healthQuery.data.database.latencyMs ?? "N/A"}ms
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Pool Total</span>
                    <span className="font-mono">
                      {healthQuery.data.database.pool.total}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Pool Idle</span>
                    <span className="font-mono">
                      {healthQuery.data.database.pool.idle}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Pool Waiting</span>
                    <span className="font-mono">
                      {healthQuery.data.database.pool.waiting}
                    </span>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border p-4">
                <h3 className="mb-3 text-lg font-semibold">Memory</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">RSS</span>
                    <span className="font-mono">
                      {healthQuery.data.memory.rssMB} MB
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Heap Used</span>
                    <span className="font-mono">
                      {healthQuery.data.memory.heapUsedMB} MB
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Heap Total</span>
                    <span className="font-mono">
                      {healthQuery.data.memory.heapTotalMB} MB
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">External</span>
                    <span className="font-mono">
                      {healthQuery.data.memory.externalMB} MB
                    </span>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border p-4">
                <h3 className="mb-3 text-lg font-semibold">Process</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">PID</span>
                    <span className="font-mono">
                      {healthQuery.data.process.pid}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Node Version</span>
                    <span className="font-mono">
                      {healthQuery.data.process.nodeVersion}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Platform</span>
                    <span className="font-mono">
                      {healthQuery.data.process.platform}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Uptime</span>
                    <span className="font-mono">
                      {Math.floor(healthQuery.data.uptime / 60)}m{" "}
                      {healthQuery.data.uptime % 60}s
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Environment</span>
                    <span className="font-mono">
                      {healthQuery.data.environment}
                    </span>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border p-4">
                <h3 className="mb-3 text-lg font-semibold">Overall Status</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Status</span>
                    <Badge
                      variant={
                        healthQuery.data.status === "ok"
                          ? "default"
                          : "destructive"
                      }
                    >
                      {healthQuery.data.status}
                    </Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Timestamp</span>
                    <span className="font-mono text-xs">
                      {new Date(healthQuery.data.timestamp).toLocaleString(
                        "en-IN",
                      )}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </>
      )}

      {tab === "seb" && <SebSettingsTab />}

      {/* Edit Setting Dialog */}
      <Dialog
        open={editingSetting !== null}
        onOpenChange={(open) => !open && setEditingSetting(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Setting: {editingSetting}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="setting-value">Value</Label>
              <Input
                id="setting-value"
                value={settingValue}
                onChange={(e) => setSettingValue(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="setting-desc">Description (optional)</Label>
              <Input
                id="setting-desc"
                value={settingDesc}
                onChange={(e) => setSettingDesc(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingSetting(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveSetting}
              disabled={updateSettingMutation.isPending}
            >
              {updateSettingMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Policy Dialog */}
      <Dialog
        open={editingPolicy !== null}
        onOpenChange={(open) => !open && setEditingPolicy(null)}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Security Policy</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="policy-json">Settings (JSON)</Label>
              <Textarea
                id="policy-json"
                value={policyJson}
                onChange={(e) => setPolicyJson(e.target.value)}
                rows={10}
                className="font-mono text-sm"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="policy-active"
                checked={policyActive}
                onChange={(e) => setPolicyActive(e.target.checked)}
              />
              <Label htmlFor="policy-active">Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingPolicy(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleSavePolicy}
              disabled={updatePolicyMutation.isPending}
            >
              {updatePolicyMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SebSettingsTab() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<SebSettings>({
    enabled: false,
    requireBek: true,
    startUrl: "",
    quitUrl: "",
    quitPassword: "",
    allowQuit: true,
    allowReload: false,
    showTime: true,
    showKeyboardLayout: false,
    allowSpellCheck: false,
    allowZoom: true,
    blockScreenCapture: true,
    blockScreenSharing: true,
    allowDeveloperConsole: false,
    muteAudio: false,
    allowWindowResize: false,
    blockedProcesses: [
      "TeamViewer",
      "AnyDesk",
      "Chrome Remote Desktop",
      "Skype",
      "Zoom",
      "Discord",
      "Snipping Tool",
      "OBS Studio",
    ],
    urlFilterRules: [
      { action: "allow", url: "localhost", description: "Allow backend API" },
      { action: "allow", url: "127.0.0.1", description: "Allow local backend" },
    ],
  });
  const [blockedProcessesText, setBlockedProcessesText] = useState("");

  const sebQuery = useQuery({
    queryKey: ["seb-settings"],
    queryFn: sebService.getSettings,
  });

  // Sync form when data loads
  useEffect(() => {
    if (sebQuery.data) {
      setForm(sebQuery.data);
      setBlockedProcessesText(
        (sebQuery.data.blockedProcesses ?? []).join("\n"),
      );
    }
  }, [sebQuery.data]);

  const saveMutation = useMutation({
    mutationFn: (data: SebSettings) => sebService.saveSettings(data),
    onSuccess: () => {
      toast.success("SEB settings saved successfully");
      queryClient.invalidateQueries({ queryKey: ["seb-settings"] });
    },
    onError: () => toast.error("Failed to save SEB settings"),
  });

  const handleSave = () => {
    const processes = blockedProcessesText
      .split("\n")
      .map((p) => p.trim())
      .filter(Boolean);
    saveMutation.mutate({ ...form, blockedProcesses: processes });
  };

  const toggle = (key: keyof SebSettings) => {
    setForm((prev) => ({ ...prev, [key]: !prev[key] as never }));
  };

  if (sebQuery.isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const toggles: {
    key: keyof SebSettings;
    label: string;
    description: string;
  }[] = [
    {
      key: "enabled",
      label: "Enable SEB",
      description: "Require Safe Exam Browser for all exams",
    },
    {
      key: "requireBek",
      label: "Require Browser Exam Key",
      description: "Reject SEB requests without valid BEK header",
    },
    {
      key: "allowQuit",
      label: "Allow Quit",
      description: "Allow students to quit SEB during exam",
    },
    {
      key: "allowReload",
      label: "Allow Reload",
      description: "Allow page reload inside SEB",
    },
    {
      key: "showTime",
      label: "Show Time",
      description: "Display clock in SEB",
    },
    {
      key: "showKeyboardLayout",
      label: "Show Keyboard Layout",
      description: "Show keyboard layout switcher",
    },
    {
      key: "allowSpellCheck",
      label: "Allow Spell Check",
      description: "Enable spell checking in SEB",
    },
    {
      key: "allowZoom",
      label: "Allow Zoom",
      description: "Allow zoom in/out in SEB",
    },
    {
      key: "allowWindowResize",
      label: "Allow Window Resize",
      description: "Allow resizing the SEB window",
    },
    {
      key: "blockScreenCapture",
      label: "Block Screen Capture",
      description: "Prevent screen capture tools",
    },
    {
      key: "blockScreenSharing",
      label: "Block Screen Sharing",
      description: "Prevent screen sharing apps",
    },
    {
      key: "allowDeveloperConsole",
      label: "Allow Developer Console",
      description: "Allow dev tools (not recommended)",
    },
    {
      key: "muteAudio",
      label: "Mute Audio",
      description: "Mute all audio in SEB",
    },
  ];

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="rounded-lg border p-4 bg-muted/30">
        <div className="flex items-center gap-2 mb-2">
          <Monitor className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-semibold">
            Safe Exam Browser Configuration
          </h3>
        </div>
        <p className="text-sm text-muted-foreground">
          These settings apply globally to all exam batches. When SEB is
          enabled, candidates must launch exams through Safe Exam Browser.
        </p>
      </div>

      {/* Toggle switches */}
      <div className="grid gap-3 sm:grid-cols-2">
        {toggles.map((t) => (
          <div
            key={t.key}
            className="flex items-start justify-between rounded-lg border p-3"
          >
            <div className="mr-3">
              <p className="text-sm font-medium">{t.label}</p>
              <p className="text-xs text-muted-foreground">{t.description}</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={form[t.key] as boolean}
              onClick={() => toggle(t.key)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                form[t.key] ? "bg-primary" : "bg-input"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-background shadow-lg ring-0 transition-transform ${
                  form[t.key] ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>
        ))}
      </div>

      {/* URL fields */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="seb-start-url">Start URL (optional)</Label>
          <Input
            id="seb-start-url"
            value={form.startUrl}
            onChange={(e) => setForm({ ...form, startUrl: e.target.value })}
            placeholder="https://exam.example.com/exam"
          />
          <p className="text-xs text-muted-foreground">
            Leave empty to auto-detect from request
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="seb-quit-url">Quit URL (optional)</Label>
          <Input
            id="seb-quit-url"
            value={form.quitUrl}
            onChange={(e) => setForm({ ...form, quitUrl: e.target.value })}
            placeholder="https://exam.example.com/quit"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="seb-quit-password">Quit Password (optional)</Label>
          <Input
            id="seb-quit-password"
            type="password"
            value={form.quitPassword ?? ""}
            onChange={(e) => setForm({ ...form, quitPassword: e.target.value })}
            placeholder="Password required to quit SEB"
          />
        </div>
      </div>

      {/* Blocked processes */}
      <div className="space-y-2">
        <Label htmlFor="seb-blocked-processes">
          Blocked Processes (one per line)
        </Label>
        <Textarea
          id="seb-blocked-processes"
          value={blockedProcessesText}
          onChange={(e) => setBlockedProcessesText(e.target.value)}
          rows={6}
          placeholder="TeamViewer&#10;AnyDesk&#10;Zoom"
          className="font-mono text-sm"
        />
        <p className="text-xs text-muted-foreground">
          These applications will be blocked while SEB is running
        </p>
      </div>

      {/* Save button */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saveMutation.isPending}>
          {saveMutation.isPending && (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          )}
          Save SEB Settings
        </Button>
      </div>
    </div>
  );
}

function Pagination({
  page,
  totalPages,
  onPageChange,
  total,
}: {
  page: number;
  totalPages: number;
  onPageChange: (p: number) => void;
  total: number;
}) {
  return (
    <div className="flex items-center justify-between">
      <p className="text-sm text-muted-foreground">Total: {total} items</p>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft className="h-4 w-4" />
          Prev
        </Button>
        <span className="text-sm">
          Page {page} of {totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Next
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
