import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { isRunningInSeb, launchSeb } from "@/lib/seb";
import { candidateService, type CandidateExam } from "@/services/candidate";
import { useQuery } from "@tanstack/react-query";
import {
    Clock,
    FileText,
    Loader2,
    LogOut,
    MonitorDown,
    Play,
    ShieldCheck,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

function getStatusBadge(status: string) {
  const variants: Record<
    string,
    "success" | "info" | "secondary" | "destructive"
  > = {
    active: "success",
    published: "info",
    scheduled: "secondary",
    finished: "destructive",
    draft: "secondary",
  };
  return (
    <Badge variant={variants[status] ?? "secondary"} className="capitalize">
      {status.replace("_", " ")}
    </Badge>
  );
}

export default function CandidateExamList() {
  const navigate = useNavigate();
  const sebMode = isRunningInSeb();
  const { data: exams, isLoading } = useQuery({
    queryKey: ["candidate-exams"],
    queryFn: candidateService.getExams,
  });

  const handleLogout = () => {
    localStorage.removeItem("candidateAccessToken");
    localStorage.removeItem("candidateRefreshToken");
    navigate("/login");
  };

  const canStart = (status: string) => status === "active";

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4 md:p-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">My Exams</h1>
            <p className="text-sm text-muted-foreground">
              Your assigned examinations
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={handleLogout}>
            <LogOut className="mr-2 h-4 w-4" />
            Logout
          </Button>
        </div>

        {!exams || exams.length === 0 ? (
          <Card className="shadow-lg">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <FileText className="mb-3 h-12 w-12 text-muted-foreground" />
              <p className="text-lg font-medium">No exams assigned</p>
              <p className="text-sm text-muted-foreground">
                Check back later or contact your administrator.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {exams.map((exam: CandidateExam) => (
              <Card
                key={exam.examBatchId}
                className="shadow-md hover:shadow-lg transition-shadow"
              >
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg">{exam.examName}</CardTitle>
                    </div>
                    {getStatusBadge(exam.status)}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-4 text-sm text-muted-foreground mb-4">
                    <div className="flex items-center gap-1">
                      <Clock className="h-4 w-4" />
                      {exam.durationMinutes} min
                    </div>
                    <div className="flex items-center gap-1">
                      <FileText className="h-4 w-4" />
                      {exam.totalMarks} marks
                    </div>
                    {exam.scheduledAt && (
                      <div>
                        Scheduled: {new Date(exam.scheduledAt).toLocaleString()}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-2">
                    {sebMode ? (
                      <Button
                        disabled={!canStart(exam.status)}
                        onClick={() => navigate(`/exam/${exam.examBatchId}`)}
                        className="w-full"
                      >
                        <Play className="mr-2 h-4 w-4" />
                        {canStart(exam.status) ? "Start Exam" : "Not Available"}
                      </Button>
                    ) : (
                      <>
                        <Button
                          disabled={!canStart(exam.status)}
                          onClick={() =>
                            launchSeb(
                              exam.examBatchId,
                              `${window.location.origin}/exam/${exam.examBatchId}`,
                            )
                          }
                          className="w-full"
                        >
                          <ShieldCheck className="mr-2 h-4 w-4" />
                          {canStart(exam.status)
                            ? "Launch in SEB"
                            : "Not Available"}
                        </Button>
                        <Button
                          disabled={!canStart(exam.status)}
                          variant="outline"
                          onClick={() => navigate(`/exam/${exam.examBatchId}`)}
                          className="w-full"
                        >
                          <Play className="mr-2 h-4 w-4" />
                          Open in Browser (No SEB)
                        </Button>
                      </>
                    )}
                    {!sebMode && (
                      <p className="flex items-center gap-1 text-xs text-amber-600">
                        <MonitorDown className="h-3 w-3" />
                        SEB recommended for secure exam. Download config if SEB
                        not installed.
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
