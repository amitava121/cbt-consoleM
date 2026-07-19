import { useQuery } from "@tanstack/react-query";
import {
    ChevronLeft,
    ChevronRight,
    Download,
    Loader2,
    Search,
} from "lucide-react";
import { useState } from "react";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "../components/ui/table";
import { auditLogService, type AuditLogQuery } from "../services/audit-logs";

export default function AuditLogsPage() {
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [actionFilter, setActionFilter] = useState("");
  const [resourceTypeFilter, setResourceTypeFilter] = useState("");

  const query: AuditLogQuery = {
    page,
    pageSize,
    ...(actionFilter && { action: actionFilter }),
    ...(resourceTypeFilter && { resourceType: resourceTypeFilter }),
  };

  const { data, isLoading } = useQuery({
    queryKey: ["audit-logs", query],
    queryFn: () => auditLogService.list(query),
  });

  const handleExport = async (format: "json" | "csv") => {
    try {
      const response = await auditLogService.export(format);
      const blob = new Blob(
        [
          typeof response === "string"
            ? response
            : JSON.stringify(response, null, 2),
        ],
        { type: format === "csv" ? "text/csv" : "application/json" },
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `audit-logs-${Date.now()}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // Error handled by axios interceptor
    }
  };

  const totalPages = data ? Math.ceil(data.total / pageSize) : 1;

  const actionColors: Record<string, string> = {
    create: "bg-green-100 text-green-800",
    update: "bg-blue-100 text-blue-800",
    delete: "bg-red-100 text-red-800",
    login: "bg-purple-100 text-purple-800",
    logout: "bg-gray-100 text-gray-800",
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Audit Logs</h1>
          <p className="text-sm text-muted-foreground">
            Tamper-evident audit trail of all system actions
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleExport("csv")}
          >
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleExport("json")}
          >
            <Download className="mr-2 h-4 w-4" />
            Export JSON
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by action..."
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="pl-8"
          />
        </div>
        <Input
          placeholder="Filter by resource type..."
          value={resourceTypeFilter}
          onChange={(e) => setResourceTypeFilter(e.target.value)}
          className="w-[200px]"
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setActionFilter("");
            setResourceTypeFilter("");
            setPage(1);
          }}
        >
          Clear
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Resource</TableHead>
                  <TableHead>Resource ID</TableHead>
                  <TableHead>IP Address</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.data.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="text-center text-muted-foreground py-8"
                    >
                      No audit logs found
                    </TableCell>
                  </TableRow>
                ) : (
                  data?.data.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="text-sm">
                        {new Date(log.timestamp).toLocaleString("en-IN", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium">
                            {log.userFullName ?? "Unknown"}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {log.userEmail ?? ""}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={
                            actionColors[log.action] ??
                            "bg-gray-100 text-gray-800"
                          }
                          variant="secondary"
                        >
                          {log.action}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {log.resourceType}
                      </TableCell>
                      <TableCell className="text-sm font-mono">
                        {log.resourceId ?? "-"}
                      </TableCell>
                      <TableCell className="text-sm font-mono">
                        {log.ipAddress ?? "-"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Total: {data?.total ?? 0} logs
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
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
                onClick={() => setPage((p) => p + 1)}
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
