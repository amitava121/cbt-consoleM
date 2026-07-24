import candidateApi from "./candidate-api.js";

function getBrowserName(): string {
  const ua = navigator.userAgent;
  if (ua.includes("Chrome") && !ua.includes("Edg")) return "Chrome";
  if (ua.includes("Edg")) return "Edge";
  if (ua.includes("Firefox")) return "Firefox";
  if (ua.includes("Safari") && !ua.includes("Chrome")) return "Safari";
  return "Unknown";
}

let sessionId: string | null = null;
let heartbeatInterval: ReturnType<typeof setInterval> | null = null;

export const browserSessionService = {
  getSessionId: () => sessionId,

  register: async (candidateId: string, candidateName: string, admitCard?: string) => {
    try {
      const res: any = await candidateApi.post("/browser-sessions/register", {
        candidateId,
        candidateName,
        admitCard,
        userAgent: navigator.userAgent,
        browserName: getBrowserName(),
        hostname: window.location.hostname,
        deviceFingerprint: localStorage.getItem("candidateDeviceFp") ?? undefined,
      });
      sessionId = res.sessionId ?? res.data?.sessionId;
      return sessionId;
    } catch (e) {
      console.warn("Browser session register failed:", e);
      return null;
    }
  },

  startHeartbeat: (getState: () => { currentPage: string; currentQuestionIndex?: number; remainingTimeSecs?: number; examBatchId?: string; examName?: string; attemptId?: string; currentStatus?: string }) => {
    if (heartbeatInterval) clearInterval(heartbeatInterval);

    heartbeatInterval = setInterval(async () => {
      if (!sessionId) return;
      try {
        const state = getState();
        await candidateApi.post("/browser-sessions/heartbeat", {
          sessionId,
          ...state,
        });
      } catch {
        // Silent fail — heartbeat is best-effort
      }
    }, 12000); // every 12 seconds
  },

  stopHeartbeat: () => {
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }
  },

  disconnect: async () => {
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }
    if (!sessionId) return;
    try {
      await candidateApi.post("/browser-sessions/disconnect", { sessionId });
    } catch {
      // Best effort
    }
    sessionId = null;
  },
};
