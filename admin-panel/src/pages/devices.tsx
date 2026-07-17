import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Monitor,
  Plus,
  Power,
  PowerOff,
  Search,
} from "lucide-react";
import { useMemo, useState } from "react";
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
import { centersService } from "../services/organization";
import { deviceService } from "../services/devices";
import type { DeviceListItem, DeviceStatus } from "../types";

const STATUS_COLORS: Record<DeviceStatus, string> = {
  registered: "bg-blue-100 text-blue-700",
  active: "bg-green-100 text-green-700",
  suspended: "bg-red-100 text-red-700",
  decommissioned: "bg-gray-200 text-gray-500",
};

interface RegisterFormState {
  deviceId: string;
  deviceName: string;
  macAddress: string;
  hardwareHash: string;
  ipAddress: string;
  centerId: string;
}

const emptyForm: RegisterFormState = {
  deviceId: "",
  deviceName: "",
  macAddress: "",
  hardwareHash: "",
  ipAddress: "",
  centerId: "",
};

export default function DevicesPage() {
  const queryClient = useQueryClient();
  const [sorting, setSorting] = useState<SortingState>([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [form, setForm] = useState<RegisterFormState>(emptyForm);

  const { data, isLoading } = useQuery({
    queryKey: ["devices", { page, pageSize, search }],
    queryFn: () =>
      deviceService.list({ page, pageSize, search: search || undefined }),
  });

  const { data: centersData } = useQuery({
    queryKey: ["centers-list"],
    queryFn: () => centersService.list({ pageSize: 100 }),
  });

  const centers = centersData?.data ?? [];

  const registerMutation = useMutation({
    mutationFn: (data: RegisterFormState) =>
      deviceService.register({
        deviceId: data.deviceId,
        deviceName: data.deviceName || undefined,
        macAddress: data.macAddress,
        hardwareHash: data.hardwareHash,
        ipAddress: data.ipAddress || undefined,
        centerId: data.centerId || null,
      }),
    onSuccess: () => {
      toast.success("Device registered successfully");
      queryClient.invalidateQueries({ queryKey: ["devices"] });
      setRegisterOpen(false);
      setForm(emptyForm);
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      toast.error(err.response?.data?.error ?? "Failed to register device");
    },
  });

  const suspendMutation = useMutation({
    mutationFn: (id: string) => deviceService.suspend(id),
    onSuccess: () => {
      toast.success("Device suspended");
      queryClient.invalidateQueries({ queryKey: ["devices"] });
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      toast.error(err.response?.data?.error ?? "Failed to suspend device");
    },
  });

  const activateMutation = useMutation({
    mutationFn: (id: string) => deviceService.activate(id),
    onSuccess: () => {
      toast.success("Device activated");
      queryClient.invalidateQueries({ queryKey: ["devices"] });
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      toast.error(err.response?.data?.error ?? "Failed to activate device");
    },
  });

  const columns = useMemo<ColumnDef<DeviceListItem>[]>(
    () => [
      {
        accessorKey: "deviceId",
        header: "Device ID",
        cell: ({ row }) => (
          <div className="flex flex-col">
            <span className="font-medium">{row.original.deviceId}</span>
            {row.original.deviceName && (
              <span className="text-xs text-muted-foreground">
                {row.original.deviceName}
              </span>
            )}
          </div>
        ),
      },
      {
        accessorKey: "macAddress",
        header: "MAC Address",
        cell: ({ row }) => (
          <span className="font-mono text-sm">{row.original.macAddress}</span>
        ),
      },
      {
        accessorKey: "ipAddress",
        header: "IP Address",
        cell: ({ row }) => row.original.ipAddress ?? "—",
      },
      {
        accessorKey: "centerName",
        header: "Center",
        cell: ({ row }) => row.original.centerName ?? "—",
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => (
          <Badge className={STATUS_COLORS[row.original.status]}>
            {row.original.status}
          </Badge>
        ),
      },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => {
          const device = row.original;
          if (device.status === "suspended") {
            return (
              <Button
                variant="outline"
                size="sm"
                disabled={activateMutation.isPending}
                onClick={() => activateMutation.mutate(device.id)}
              >
                <Power className="mr-1 h-3 w-3" />
                Activate
              </Button>
            );
          }
          if (device.status === "active" || device.status === "registered") {
            return (
              <Button
                variant="outline"
                size="sm"
                disabled={suspendMutation.isPending}
                onClick={() => suspendMutation.mutate(device.id)}
              >
                <PowerOff className="mr-1 h-3 w-3" />
                Suspend
              </Button>
            );
          }
          return null;
        },
      },
    ],
    [activateMutation, suspendMutation],
  );

  const table = useReactTable({
    data: data?.data ?? [],
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const totalPages = data ? Math.ceil(data.total / pageSize) : 1;

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Devices</h1>
          <p className="text-sm text-muted-foreground">
            Register and manage exam client devices
          </p>
        </div>
        <Button onClick={() => setRegisterOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Register Device
        </Button>
      </div>

      {/* Search */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by device ID, name, MAC..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="pl-9"
          />
        </div>
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((header) => (
                  <TableHead key={header.id}>
                    {flexRender(
                      header.column.columnDef.header,
                      header.getContext(),
                    )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  <Loader2 className="mx-auto h-6 w-6 animate-spin" />
                </TableCell>
              </TableRow>
            ) : table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                  No devices registered.
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {data && data.total > 0 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, data.total)} of {data.total}
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
      )}

      {/* Register Dialog */}
      <Dialog open={registerOpen} onOpenChange={setRegisterOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Register Device</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="dev-id">Device ID *</Label>
              <Input
                id="dev-id"
                placeholder="e.g. PC-001"
                value={form.deviceId}
                onChange={(e) => setForm({ ...form, deviceId: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dev-name">Device Name</Label>
              <Input
                id="dev-name"
                placeholder="e.g. Lab1-PC01"
                value={form.deviceName}
                onChange={(e) => setForm({ ...form, deviceName: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dev-mac">MAC Address *</Label>
              <Input
                id="dev-mac"
                placeholder="AA:BB:CC:DD:EE:FF"
                value={form.macAddress}
                onChange={(e) => setForm({ ...form, macAddress: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                Format: XX:XX:XX:XX:XX:XX
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="dev-hash">Hardware Hash *</Label>
              <Input
                id="dev-hash"
                placeholder="Hardware fingerprint hash"
                value={form.hardwareHash}
                onChange={(e) => setForm({ ...form, hardwareHash: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="dev-ip">IP Address</Label>
                <Input
                  id="dev-ip"
                  placeholder="192.168.1.100"
                  value={form.ipAddress}
                  onChange={(e) => setForm({ ...form, ipAddress: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dev-center">Center</Label>
                <select
                  id="dev-center"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                  value={form.centerId}
                  onChange={(e) => setForm({ ...form, centerId: e.target.value })}
                >
                  <option value="">No center</option>
                  {centers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRegisterOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={
                registerMutation.isPending ||
                !form.deviceId ||
                !form.macAddress ||
                !form.hardwareHash
              }
              onClick={() => registerMutation.mutate(form)}
            >
              {registerMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Monitor className="mr-2 h-4 w-4" />
              )}
              Register
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
