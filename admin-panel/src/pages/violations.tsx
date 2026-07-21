import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  ShieldAlert,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import {
  type ViolationRow,
  type ViolationStats,
  monitoringService,
} from "../services/monitoring";

const severityColors: Record<string, string> = {
  low: "bg-blue-100 text-blue-700",
  medium: "bg-yellow-100 text-yellow-700",
  high: "bg-orange-100 text-orange-700",
  critical: "bg-red-100 text-red-700",
};

const violationTypeLabels: Record<string, string> = {
  tab_switch: "Tab Switch",
  window_blur: "Window Blur",
  process_violation: "Process Violation",
  clipboard_access: "Clipboard Access",
  screenshot_attempt: "Screenshot Attempt",
  vm_detected: "VM Detected",
  multiple_faces: "Multiple Faces",
  gaze_away: "Gaze Away",
  browser_devtools: "DevTools Open",
  time_manipulation: "Time Manipulation",
};

export default function ViolationsPage() {
  const [violations, setViolations] = useState<ViolationRow[]>([]);
  const [stats, setStats] = useState<ViolationStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [severityFilter, setSeverityFilter] = useState("");
  const [showResolved, setShowResolved] = useState<boolean | undefined>(undefined);

  const loadViolations = async () => {
    setLoading(true);
    try {
      const [violationsRes, statsRes] = await Promise.all([
        monitoringService.getViolations({
          page,
          pageSize: 20,
          severity: severityFilter || undefined,
          isResolved: showResolved,
        }),
        monitoringService.getViolationStats(),
      ]);
      setViolations(violationsRes.violations);
      setTotal(violationsRes.pagination.total);
      setTotalPages(violationsRes.pagination.totalPages);
      setStats(statsRes.stats);
    } catch {
      toast.error("Failed to load violations");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadViolations();
  }, [page, severityFilter, showResolved]);

  const handleResolve = async (id: string, isResolved: boolean) => {
    try {
      await monitoringService.resolveViolation(id, isResolved);
      toast.success(isResolved ? "Violation resolved" : "Violation reopened");
      loadViolations();
    } catch {
      toast.error("Failed to update violation");
    }
  };

  return (
    <div className="space-y-6">


      {stats && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Violations
              </CardTitle>
              <ShieldAlert className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Unresolved
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">
                {stats.unresolved}
              </div>
            </CardContent>
          </Card>
          {(["low", "medium", "high", "critical"] as const).map((sev) => (
            <Card key={sev}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground capitalize">
                  {sev}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${severityColors[sev]} inline-flex rounded-full px-2`}>
                  {stats.bySeverity[sev]}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Violation Log</CardTitle>
            <div className="flex gap-2">
              <select
                value={severityFilter}
                onChange={(e) => {
                  setSeverityFilter(e.target.value);
                  setPage(1);
                }}
                className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
              >
                <option value="">All Severities</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
              <select
                value={showResolved === undefined ? "" : showResolved ? "resolved" : "unresolved"}
                onChange={(e) => {
                  setShowResolved(
                    e.target.value === "" ? undefined : e.target.value === "resolved",
                  );
                  setPage(1);
                }}
                className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
              >
                <option value="">All</option>
                <option value="unresolved">Unresolved</option>
                <option value="resolved">Resolved</option>
              </select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : violations.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-green-500" />
              No violations found
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Severity</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Attempt</TableHead>
                    <TableHead className="text-right">Time</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {violations.map((v) => (
                    <TableRow key={v.id}>
                      <TableCell className="font-medium">
                        {violationTypeLabels[v.violationType] ?? v.violationType}
                      </TableCell>
                      <TableCell>
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${severityColors[v.severity] ?? ""}`}
                        >
                          {v.severity}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-xs truncate text-muted-foreground">
                        {v.description}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {v.attemptId.slice(0, 8)}...
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">
                        {new Date(v.createdAt).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-center">
                        {v.isResolved ? (
                          <span className="inline-flex items-center gap-1 text-xs text-green-600">
                            <CheckCircle2 className="h-3 w-3" /> Resolved
                          </span>
                        ) : (
                          <button
                            onClick={() => handleResolve(v.id, true)}
                            className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                          >
                            <AlertTriangle className="h-3 w-3" /> Resolve
                          </button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-4">
                  <span className="text-sm text-muted-foreground">
                    {total} total violations
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="rounded-md border border-input px-3 py-1 text-sm disabled:opacity-50"
                    >
                      Prev
                    </button>
                    <span className="px-2 py-1 text-sm">
                      Page {page} of {totalPages}
                    </span>
                    <button
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                      className="rounded-md border border-input px-3 py-1 text-sm disabled:opacity-50"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
