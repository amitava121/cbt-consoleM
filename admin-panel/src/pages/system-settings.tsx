import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  systemService,
  type UpdateSettingInput,
  type UpdatePolicyInput,
} from "../services/system";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Badge } from "../components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "../components/ui/dialog";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { ChevronLeft, ChevronRight, Search, Loader2, Settings, Shield, Activity } from "lucide-react";

type Tab = "settings" | "policies" | "health";

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
    queryFn: () => systemService.listSettings({ page, pageSize, search: search || undefined }),
    enabled: tab === "settings",
  });

  const policiesQuery = useQuery({
    queryKey: ["security-policies", page, pageSize, search],
    queryFn: () => systemService.listPolicies({ page, pageSize, search: search || undefined }),
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

  const handleEditSetting = (key: string, currentValue: string, currentDesc: string | null) => {
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

  const handleEditPolicy = (id: string, json: Record<string, unknown>, isActive: boolean) => {
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
      <div>
        <h1 className="text-2xl font-bold">System Settings</h1>
        <p className="text-sm text-muted-foreground">
          Manage system configuration, security policies, and health monitoring
        </p>
      </div>

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
                        <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                          No settings found
                        </TableCell>
                      </TableRow>
                    ) : (
                      settingsQuery.data?.data.map((s) => (
                        <TableRow key={s.id}>
                          <TableCell className="font-mono text-sm font-medium">{s.key}</TableCell>
                          <TableCell className="font-mono text-sm">{s.value}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{s.valueType}</Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {s.description ?? "-"}
                          </TableCell>
                          <TableCell>
                            <Badge variant={s.isEditable ? "default" : "secondary"}>
                              {s.isEditable ? "Yes" : "No"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={!s.isEditable}
                              onClick={() => handleEditSetting(s.key, s.value, s.description)}
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
                        <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                          No security policies found
                        </TableCell>
                      </TableRow>
                    ) : (
                      policiesQuery.data?.data.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell className="font-medium">{p.policyName}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {p.description ?? "-"}
                          </TableCell>
                          <TableCell className="text-sm font-mono">
                            {JSON.stringify(p.settingsJson).slice(0, 60)}
                            {JSON.stringify(p.settingsJson).length > 60 ? "..." : ""}
                          </TableCell>
                          <TableCell>
                            <Badge variant={p.isActive ? "default" : "secondary"}>
                              {p.isActive ? "Active" : "Inactive"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEditPolicy(p.id, p.settingsJson, p.isActive)}
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
                    <Badge variant={healthQuery.data.database.status === "ok" ? "default" : "destructive"}>
                      {healthQuery.data.database.status}
                    </Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Latency</span>
                    <span className="font-mono">{healthQuery.data.database.latencyMs ?? "N/A"}ms</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Pool Total</span>
                    <span className="font-mono">{healthQuery.data.database.pool.total}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Pool Idle</span>
                    <span className="font-mono">{healthQuery.data.database.pool.idle}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Pool Waiting</span>
                    <span className="font-mono">{healthQuery.data.database.pool.waiting}</span>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border p-4">
                <h3 className="mb-3 text-lg font-semibold">Memory</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">RSS</span>
                    <span className="font-mono">{healthQuery.data.memory.rssMB} MB</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Heap Used</span>
                    <span className="font-mono">{healthQuery.data.memory.heapUsedMB} MB</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Heap Total</span>
                    <span className="font-mono">{healthQuery.data.memory.heapTotalMB} MB</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">External</span>
                    <span className="font-mono">{healthQuery.data.memory.externalMB} MB</span>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border p-4">
                <h3 className="mb-3 text-lg font-semibold">Process</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">PID</span>
                    <span className="font-mono">{healthQuery.data.process.pid}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Node Version</span>
                    <span className="font-mono">{healthQuery.data.process.nodeVersion}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Platform</span>
                    <span className="font-mono">{healthQuery.data.process.platform}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Uptime</span>
                    <span className="font-mono">{Math.floor(healthQuery.data.uptime / 60)}m {healthQuery.data.uptime % 60}s</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Environment</span>
                    <span className="font-mono">{healthQuery.data.environment}</span>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border p-4">
                <h3 className="mb-3 text-lg font-semibold">Overall Status</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Status</span>
                    <Badge variant={healthQuery.data.status === "ok" ? "default" : "destructive"}>
                      {healthQuery.data.status}
                    </Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Timestamp</span>
                    <span className="font-mono text-xs">
                      {new Date(healthQuery.data.timestamp).toLocaleString("en-IN")}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </>
      )}

      {/* Edit Setting Dialog */}
      <Dialog open={editingSetting !== null} onOpenChange={(open) => !open && setEditingSetting(null)}>
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
            <Button onClick={handleSaveSetting} disabled={updateSettingMutation.isPending}>
              {updateSettingMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Policy Dialog */}
      <Dialog open={editingPolicy !== null} onOpenChange={(open) => !open && setEditingPolicy(null)}>
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
            <Button onClick={handleSavePolicy} disabled={updatePolicyMutation.isPending}>
              {updatePolicyMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
