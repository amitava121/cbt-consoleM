import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    candidateService,
    generateDeviceFingerprint,
} from "@/services/candidate";
import { Calendar, CreditCard, Loader2, Lock } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

export default function CandidateLogin() {
  const navigate = useNavigate();
  const [admitCardNumber, setAdmitCardNumber] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!admitCardNumber || !dateOfBirth) return;

    setLoading(true);
    try {
      const fingerprint = generateDeviceFingerprint();
      localStorage.setItem("candidateDeviceFp", fingerprint);
      const res: any = await candidateService.login(
        admitCardNumber,
        dateOfBirth,
        fingerprint,
      );
      localStorage.setItem("candidateAccessToken", res.accessToken);
      localStorage.setItem("candidateRefreshToken", res.refreshToken);
      toast.success(`Welcome, ${res.user?.fullName ?? "Candidate"}`);
      navigate("/exams");
    } catch (err: any) {
      toast.error(err.response?.data?.error ?? "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 px-4">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-blue-600">
            <Lock className="h-6 w-6 text-white" />
          </div>
          <CardTitle className="text-2xl">Candidate Login</CardTitle>
          <p className="text-sm text-muted-foreground">
            Enter your admit card number and date of birth to access your exams
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="admitCardNumber">Admit Card Number</Label>
              <div className="relative">
                <CreditCard className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="admitCardNumber"
                  type="text"
                  placeholder="e.g. ADM-2024-001"
                  value={admitCardNumber}
                  onChange={(e) => setAdmitCardNumber(e.target.value)}
                  className="pl-9"
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="dateOfBirth">Date of Birth (DDMMYYYY)</Label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="dateOfBirth"
                  type="text"
                  placeholder="e.g. 15052001"
                  value={dateOfBirth}
                  onChange={(e) => setDateOfBirth(e.target.value)}
                  className="pl-9"
                  maxLength={8}
                  pattern="\d{8}"
                  title="Enter date of birth as DDMMYYYY (e.g. 15 May 2001 = 15052001)"
                  required
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Format: Day Month Year (e.g. 15 May 2001 = 15052001)
              </p>
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              {loading ? "Signing in..." : "Sign In"}
            </Button>
          </form>
          <p className="mt-4 text-center text-xs text-muted-foreground">
            Admin?{" "}
            <a href="/login" className="text-blue-600 hover:underline">
              Go to admin login
            </a>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
