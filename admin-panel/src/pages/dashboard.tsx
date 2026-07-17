import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Users, FileQuestion, ClipboardList, Activity } from "lucide-react";

const stats = [
  { label: "Total Users", value: "—", icon: Users },
  { label: "Questions", value: "—", icon: FileQuestion },
  { label: "Active Exams", value: "—", icon: ClipboardList },
  { label: "Live Sessions", value: "0", icon: Activity },
];

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">System overview at a glance</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.label}
              </CardTitle>
              <stat.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
