import axios from "axios";
import { API_BASE_URL } from "../apiConfig";
import { clearCandidateSessionAuth, getCandidateSessionToken } from "./candidateAuth";

// Create a single, consistent Axios instance
const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 50000,
  headers: { "Content-Type": "application/json" },
});
const CANDIDATE_ROUTE_RE = /^\/?(?:transcribe|stt|tts|voice-clone-instant|save-answer|save-behavioral-data|coding-round|case-study|upload-full-recording|recording-upload-failure|complete-session|submit-feedback|proctoring\/violation|session\/[^/]+\/violation|interview\/[^/]+\/(?:summary|ai-summary|alert)|generate-next-question|generate-more-questions|live-heartbeat)(?:\/|\?|$)/

/* =============================================================================
   REQUEST INTERCEPTOR → attaches token from sessionStorage
============================================================================= */
api.interceptors.request.use(
  (config) => {
    const requestPath = String(config.url || "");
    const candidateRequest = CANDIDATE_ROUTE_RE.test(requestPath);
    let token = candidateRequest ? getCandidateSessionToken() : sessionStorage.getItem("masterToken");

    if (!candidateRequest) {
      if (!token) token = sessionStorage.getItem("adminToken");
      if (!token) token = sessionStorage.getItem("token");

      if (!token) {
        const adminUserStr = sessionStorage.getItem("adminUser");
        if (adminUserStr) {
          try {
            const parsed = JSON.parse(adminUserStr);
            token = parsed.token || (parsed.data && parsed.data.token);
          } catch (e) {
            console.error("Error parsing adminUser for token:", e);
          }
        }
      }
    }

    // Attach token if resolved
    if (token) {
      config.headers["Authorization"] = `Bearer ${token}`;
    }

    return config;
  },
  (error) => Promise.reject(error),
);

/* =============================================================================
   RESPONSE INTERCEPTOR → pass-through response/error
============================================================================= */
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const requestPath = String(error.config?.url || "")
      const candidateRequest = CANDIDATE_ROUTE_RE.test(requestPath)
      if (candidateRequest) {
        clearCandidateSessionAuth()
      } else if (!window.__hireIqAuthRedirecting) {
        window.__hireIqAuthRedirecting = true
        sessionStorage.removeItem("auth")
        sessionStorage.removeItem("masterToken")
        sessionStorage.removeItem("adminToken")
        sessionStorage.removeItem("token")
        window.location.assign("/login")
      }
    }
    return Promise.reject(error)
  },
);

/* =============================================================================
   HEALTH & GENERAL
============================================================================= */
export const getRootHealth = async () => {
  try {
    const response = await api.get("/");
    return response.data;
  } catch (error) {
    throw error.response?.data?.detail || error.response?.data?.message || "Health check failed";
  }
};

export const getHealth = async () => {
  try {
    const response = await api.get("/health");
    return response.data;
  } catch (error) {
    throw error.response?.data?.detail || error.response?.data?.message || "Health check failed";
  }
};

export const getLastError = async () => {
  try {
    const response = await api.get("/admin/last-error");
    return response.data;
  } catch (error) {
    throw error.response?.data?.detail || error.response?.data?.message || "Failed to fetch last error";
  }
};

/* =============================================================================
   PUBLIC & PRICING
============================================================================= */
export const getPlans = async () => {
  try {
    const response = await api.get("/api/plans");
    return response.data;
  } catch (error) {
    throw error.response?.data?.detail || error.response?.data?.message || "Failed to fetch pricing plans";
  }
};

export const registerAdmin = async (data) => {
  try {
    const response = await api.post("/api/register", data);
    return response.data;
  } catch (error) {
    throw error.response?.data?.detail || error.response?.data?.message || "Registration failed";
  }
};

/* =============================================================================
   CANDIDATE INTERVIEW FLOW
============================================================================= */
export const startInterview = async (data) => {
  try {
    const response = await api.post("/start-interview", data);
    return response.data;
  } catch (error) {
    throw error.response?.data?.detail || error.response?.data?.message || "Failed to start interview";
  }
};

export const generateNextQuestion = async (data) => {
  try {
    const response = await api.post("/generate-next-question", data);
    return response.data;
  } catch (error) {
    throw error.response?.data?.detail || error.response?.data?.message || "Failed to generate question";
  }
};

export const getQuestion = async (interviewId, questionId) => {
  try {
    const response = await api.get(`/interview/${interviewId}/question/${questionId}`);
    return response.data;
  } catch (error) {
    throw error.response?.data?.detail || error.response?.data?.message || "Failed to fetch question";
  }
};

export const uploadAnswer = async (formData) => {
  try {
    const response = await api.post("/upload-answer", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return response.data;
  } catch (error) {
    throw error.response?.data?.detail || error.response?.data?.message || "Failed to upload answer audio";
  }
};

export const getInterviewSummary = async (interviewId) => {
  try {
    const response = await api.get(`/interview/${interviewId}/summary`);
    return response.data;
  } catch (error) {
    throw error.response?.data?.detail || error.response?.data?.message || "Failed to fetch summary";
  }
};

export const chat = async (data) => {
  try {
    const response = await api.post("/chat", data);
    return response.data;
  } catch (error) {
    throw error.response?.data?.detail || error.response?.data?.message || "Chat failed";
  }
};

export const saveAnswer = async (data) => {
  try {
    const response = await api.post("/save-answer", data);
    return response.data;
  } catch (error) {
    throw error.response?.data?.detail || error.response?.data?.message || "Failed to save answer details";
  }
};

export const saveBehavioralData = async (data) => {
  try {
    const response = await api.post("/save-behavioral-data", data);
    return response.data;
  } catch (error) {
    throw error.response?.data?.detail || error.response?.data?.message || "Failed to save behavioral telemetry";
  }
};

export const startCodingRound = async (data) => {
  try {
    const response = await api.post("/coding-round/start", data);
    return response.data;
  } catch (error) {
    throw error.response?.data?.detail || error.response?.data?.message || "Failed to start coding round";
  }
};

export const startCaseStudyRound = async (data) => {
  try {
    const response = await api.post("/case-study/start", data);
    return response.data;
  } catch (error) {
    throw error.response?.data?.detail || error.response?.data?.message || "Failed to start case study";
  }
};

export const submitCaseStudyAnswer = async (data) => {
  try {
    const response = await api.post("/case-study/submit-answer", data);
    return response.data;
  } catch (error) {
    throw error.response?.data?.detail || error.response?.data?.message || "Failed to submit case study answer";
  }
};

export const getCodingRound = async (interviewId) => {
  try {
    const response = await api.get(`/coding-round/${interviewId}`);
    return response.data;
  } catch (error) {
    throw error.response?.data?.detail || error.response?.data?.message || "Failed to fetch coding details";
  }
};

export const codingRoundCheckpoint = async (data) => {
  try {
    const response = await api.post("/coding-round/checkpoint", data);
    return response.data;
  } catch (error) {
    throw error.response?.data?.detail || error.response?.data?.message || "Failed to save checkpoint";
  }
};

export const codingRoundSubmit = async (data) => {
  try {
    const response = await api.post("/coding-round/submit", data);
    return response.data;
  } catch (error) {
    throw error.response?.data?.detail || error.response?.data?.message || "Failed to submit code solution";
  }
};

export const codingRoundRun = async (data) => {
  try {
    const response = await api.post("/coding-round/run", data);
    return response.data;
  } catch (error) {
    throw error.response?.data?.detail || error.response?.data?.message || "Failed to run solution test cases";
  }
};

export const codingRoundObserve = async (data) => {
  try {
    const response = await api.post("/coding-round/observe", data);
    return response.data;
  } catch (error) {
    throw error.response?.data?.detail || error.response?.data?.message || "Failed to observe code telemetry";
  }
};

export const getInterviewAiSummary = async (interviewId) => {
  try {
    const response = await api.get(`/interview/${interviewId}/ai-summary`);
    return response.data;
  } catch (error) {
    throw error.response?.data?.detail || error.response?.data?.message || "Failed to fetch AI feedback summary";
  }
};

export const uploadFullRecording = async (formData) => {
  try {
    const response = await api.post("/upload-full-recording", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return response.data;
  } catch (error) {
    throw error.response?.data?.detail || error.response?.data?.message || "Failed to upload recording file";
  }
};

export const generateReport = async (interviewId) => {
  try {
    const response = await api.get(`/generate-report/${interviewId}`);
    return response.data;
  } catch (error) {
    throw error.response?.data?.detail || error.response?.data?.message || "Failed to generate report";
  }
};

export const uploadResume = async (formData) => {
  try {
    const response = await api.post("/upload-resume", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return response.data;
  } catch (error) {
    throw error.response?.data?.detail || error.response?.data?.message || "Failed to upload resume";
  }
};

export const startSessionInterview = async (data) => {
  try {
    const response = await api.post("/start-session-interview", data);
    return response.data;
  } catch (error) {
    throw error.response?.data?.detail || error.response?.data?.message || "Failed to begin session interview";
  }
};

export const logViolation = async (interviewId, data) => {
  try {
    const response = await api.post(`/session/${interviewId}/violation`, data);
    return response.data;
  } catch (error) {
    throw error.response?.data?.detail || error.response?.data?.message || "Failed to log browser violation";
  }
};

export const completeSession = async (linkId) => {
  try {
    const response = await api.post(`/complete-session/${linkId}`);
    return response.data;
  } catch (error) {
    throw error.response?.data?.detail || error.response?.data?.message || "Failed to complete interview session";
  }
};

export const liveHeartbeat = async (data, monitoringToken) => {
  try {
    if (!monitoringToken) {
      throw new Error("Candidate monitoring token is required");
    }

    const response = await api.post("/live-heartbeat", data, {
      headers: { Authorization: `Bearer ${monitoringToken}` },
    });
    return response.data;
  } catch (error) {
    throw error.response?.data?.detail || error.response?.data?.message || error.message || "Heartbeat failed";
  }
};

/* =============================================================================
   ADMIN GENERAL & AUTH
============================================================================= */
export const adminLogin = async (data) => {
  try {
    const response = await api.post("/admin/login", data);
    return response.data;
  } catch (error) {
    throw error.response?.data?.detail || error.response?.data?.message || "Admin login failed";
  }
};

export const firebaseAuth = async (data) => {
  try {
    const response = await api.post("/admin/firebase-auth", data);
    return response.data;
  } catch (error) {
    throw error.response?.data?.detail || error.response?.data?.message || "Firebase login failed";
  }
};

export const adminForgotPassword = async (data) => {
  try {
    const response = await api.post("/admin/forgot-password", data);
    return response.data;
  } catch (error) {
    throw error.response?.data?.detail || error.response?.data?.message || "Failed to request password reset OTP";
  }
};

export const adminVerifyOtp = async (data) => {
  try {
    const response = await api.post("/admin/verify-otp", data);
    return response.data;
  } catch (error) {
    throw error.response?.data?.detail || error.response?.data?.message || "OTP verification failed";
  }
};

export const adminResetPassword = async (data) => {
  try {
    const response = await api.post("/admin/reset-password", data);
    return response.data;
  } catch (error) {
    throw error.response?.data?.detail || error.response?.data?.message || "Failed to update password";
  }
};

export const updateAdminProfile = async (data) => {
  try {
    const response = await api.post("/admin/profile", data);
    return response.data;
  } catch (error) {
    throw error.response?.data?.detail || error.response?.data?.message || "Failed to update profile settings";
  }
};

export const uploadProfileImage = async (formData) => {
  try {
    const response = await api.post("/master/profile/image", formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });
    return response.data;
  } catch (error) {
    throw error.response?.data?.detail || error.response?.data?.message || "Failed to upload profile image";
  }
};

export const getDashboardStats = async (params) => {
  try {
    const response = await api.get("/admin/dashboard-stats", { params });
    return response.data;
  } catch (error) {
    throw error.response?.data?.detail || error.response?.data?.message || "Failed to fetch dashboard stats";
  }
};

export const exportSessions = async (params) => {
  try {
    const response = await api.get("/admin/export-sessions", { params });
    return response.data;
  } catch (error) {
    throw error.response?.data?.detail || error.response?.data?.message || "Failed to export sessions";
  }
};

export const previewEmail = async (data) => {
  try {
    const response = await api.post("/admin/preview-email", data);
    return response.data;
  } catch (error) {
    throw error.response?.data?.detail || error.response?.data?.message || "Failed to preview email template";
  }
};

export const parseResume = async (formData) => {
  try {
    const response = await api.post("/admin/parse-resume", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return response.data;
  } catch (error) {
    throw error.response?.data?.detail || error.response?.data?.message || "Failed to parse candidate resume details";
  }
};

export const checkCandidate = async (params) => {
  try {
    const response = await api.get("/admin/candidate/check", { params });
    return response.data;
  } catch (error) {
    throw error.response?.data?.detail || error.response?.data?.message || "Failed to validate candidate credentials";
  }
};

export const createSession = async (data) => {
  try {
    const response = await api.post("/admin/create-session", data);
    return response.data;
  } catch (error) {
    throw error.response?.data?.detail || error.response?.data?.message || "Failed to create candidate session";
  }
};

export const bulkCreateSessions = async (data) => {
  try {
    const response = await api.post("/admin/bulk-create-sessions", data);
    return response.data;
  } catch (error) {
    throw error.response?.data?.detail || error.response?.data?.message || "Failed to create candidate sessions";
  }
};

export const getSession = async (linkId) => {
  try {
    const response = await api.get(`/session/${linkId}`);
    return response.data;
  } catch (error) {
    throw error.response?.data?.detail || error.response?.data?.message || "Failed to retrieve session details";
  }
};

export const getAllSessions = async (params) => {
  try {
    const response = await api.get("/admin/sessions", { params });
    return response.data;
  } catch (error) {
    throw error.response?.data?.detail || error.response?.data?.message || "Failed to fetch candidate sessions list";
  }
};

export const deleteSession = async (linkId) => {
  try {
    const response = await api.delete(`/admin/sessions/${linkId}`);
    return response.data;
  } catch (error) {
    throw error.response?.data?.detail || error.response?.data?.message || "Failed to remove session";
  }
};

export const deactivateSession = async (linkId) => {
  try {
    const response = await api.post(`/admin/sessions/${linkId}/deactivate`);
    return response.data;
  } catch (error) {
    throw error.response?.data?.detail || error.response?.data?.message || "Failed to deactivate session";
  }
};

export const activateSession = async (linkId) => {
  try {
    const response = await api.post(`/admin/sessions/${linkId}/activate`);
    return response.data;
  } catch (error) {
    throw error.response?.data?.detail || error.response?.data?.message || "Failed to activate session";
  }
};

export const rescheduleSession = async (linkId, data) => {
  try {
    const response = await api.post(`/admin/sessions/${linkId}/reschedule`, data);
    return response.data;
  } catch (error) {
    throw error.response?.data?.detail || error.response?.data?.message || "Failed to reschedule session";
  }
};

export const updateDecision = async (data) => {
  try {
    const response = await api.post("/admin/update-decision", data);
    return response.data;
  } catch (error) {
    throw error.response?.data?.detail || error.response?.data?.message || "Failed to update decision";
  }
};

export const adminCopilotChat = async (data) => {
  try {
    const response = await api.post("/admin/copilot", data);
    return response.data;
  } catch (error) {
    throw error.response?.data?.detail || error.response?.data?.message || "Failed to query copilot";
  }
};

export const adminCopilotExecute = async (data) => {
  try {
    const response = await api.post("/admin/copilot/execute", data);
    return response.data;
  } catch (error) {
    throw error.response?.data?.detail || error.response?.data?.message || "Copilot script execution failed";
  }
};

export const calculateAtsScore = async (data) => {
  try {
    const response = await api.post("/admin/ats-score", data);
    return response.data;
  } catch (error) {
    throw error.response?.data?.detail || error.response?.data?.message || "Failed to calculate ATS score";
  }
};

export const getLiveSnapshot = async (linkId) => {
  try {
    const response = await api.get(`/admin/live-snapshot/${linkId}`);
    return response.data;
  } catch (error) {
    throw error.response?.data?.detail || error.response?.data?.message || "Failed to retrieve live snapshot";
  }
};

export const getOngoingInterviews = async (params) => {
  try {
    const response = await api.get("/admin/ongoing-interviews", { params });
    return response.data;
  } catch (error) {
    throw error.response?.data?.detail || error.response?.data?.message || "Failed to retrieve ongoing interviews list";
  }
};

export const requestCredits = async (data) => {
  try {
    const response = await api.post("/admin/credit-requests", data);
    return response.data;
  } catch (error) {
    throw error.response?.data?.detail || error.response?.data?.message || "Failed to request additional credits";
  }
};

export const getInterviewDetails = async (linkId) => {
  try {
    const response = await api.get(`/admin/interview/${linkId}`);
    return response.data;
  } catch (error) {
    throw error.response?.data?.detail || error.response?.data?.message || "Failed to retrieve interview details";
  }
};

/* =============================================================================
   SUPER ADMIN
============================================================================= */
export const getSuperAdminDashboardStats = async (params) => {
  try {
    const response = await api.get("/super-admin/dashboard-stats", { params });
    return response.data;
  } catch (error) {
    throw error.response?.data?.detail || error.response?.data?.message || "Failed to fetch dashboard stats";
  }
};

export const getSubAdmins = async () => {
  try {
    const response = await api.get("/super-admin/admins");
    return response.data;
  } catch (error) {
    throw error.response?.data?.detail || error.response?.data?.message || "Failed to fetch sub-admins list";
  }
};

export const createSubAdmin = async (data) => {
  try {
    const response = await api.post("/super-admin/admins", data);
    return response.data;
  } catch (error) {
    throw error.response?.data?.detail || error.response?.data?.message || "Failed to create sub-admin account";
  }
};

export const getCreditRequests = async () => {
  try {
    const response = await api.get("/super-admin/credit-requests");
    return response.data;
  } catch (error) {
    throw error.response?.data?.detail || error.response?.data?.message || "Failed to fetch credit requests";
  }
};

export const updateCreditRequest = async (requestId, data) => {
  try {
    const response = await api.put(`/super-admin/credit-requests/${requestId}`, data);
    return response.data;
  } catch (error) {
    throw error.response?.data?.detail || error.response?.data?.message || "Failed to update credit request status";
  }
};

export const getSuperAdminDashboard = async (params) => {
  try {
    const response = await api.get("/superadmin/dashboard", { params });
    return response.data;
  } catch (error) {
    throw error.response?.data?.detail || error.response?.data?.message || "Failed to retrieve superadmin dashboard telemetry";
  }
};

export const getSuperAdminQualified = async (params) => {
  try {
    const response = await api.get("/superadmin/candidates/qualified", { params });
    return response.data;
  } catch (error) {
    throw error.response?.data?.detail || error.response?.data?.message || "Failed to retrieve qualified candidates list";
  }
};

export const getSuperAdminRejected = async (params) => {
  try {
    const response = await api.get("/superadmin/candidates/rejected", { params });
    return response.data;
  } catch (error) {
    throw error.response?.data?.detail || error.response?.data?.message || "Failed to retrieve rejected candidates list";
  }
};

export const superadminInterviewCreate = async (data) => {
  try {
    const response = await api.post("/superadmin/interview/create", data);
    return response.data;
  } catch (error) {
    throw error.response?.data?.detail || error.response?.data?.message || "Failed to create superadmin interview template";
  }
};

export const getSuperAdminProfile = async () => {
  try {
    const response = await api.get("/superadmin/profile");
    return response.data;
  } catch (error) {
    throw error.response?.data?.detail || error.response?.data?.message || "Failed to fetch superadmin profile details";
  }
};

export const superadminBulkDelete = async (data) => {
  try {
    const response = await api.delete("/superadmin/candidates/bulk", { data });
    return response.data;
  } catch (error) {
    throw error.response?.data?.detail || error.response?.data?.message || "Failed to perform bulk candidate deletion";
  }
};

export const superadminExportExcel = async (data) => {
  try {
    const response = await api.post("/superadmin/export/excel", data, { responseType: "blob" });
    return response.data;
  } catch (error) {
    throw error.response?.data?.detail || error.response?.data?.message || "Failed to export spreadsheet file";
  }
};

export const superadminPatchCreditRequest = async (requestId, data) => {
  try {
    const response = await api.patch(`/superadmin/credits/request/${requestId}`, data);
    return response.data;
  } catch (error) {
    throw error.response?.data?.detail || error.response?.data?.message || "Failed to update credit request parameters";
  }
};

/* =============================================================================
   MASTER ADMIN
============================================================================= */
export const masterLogin = async (data) => {
  try {
    const response = await api.post("/master/login", data);
    return response.data;
  } catch (error) {
    throw error.response?.data?.detail || error.response?.data?.message || "Master login failed";
  }
};

/* ===== MASTER & USER NOTIFICATIONS ===== */
export const getNotifications = async () => {
  try {
    const response = await api.get("/api/notifications");
    return response.data;
  } catch (error) {
    throw error.response?.data?.detail || error.response?.data?.message || "Failed to fetch notifications";
  }
};

export const getMasterNotifications = getNotifications;

export const markNotificationAsRead = async (notificationId) => {
  try {
    const response = await api.put(`/api/notifications/${notificationId}/read`);
    return response.data;
  } catch (error) {
    throw error.response?.data?.detail || error.response?.data?.message || "Failed to mark notification as read";
  }
};

export const markAllNotificationsAsRead = async () => {
  try {
    const response = await api.post("/api/notifications/read-all");
    return response.data;
  } catch (error) {
    throw error.response?.data?.detail || error.response?.data?.message || "Failed to mark all notifications as read";
  }
};

export const deleteNotification = async (notificationId) => {
  try {
    const response = await api.delete(`/api/notifications/${notificationId}`);
    return response.data;
  } catch (error) {
    throw error.response?.data?.detail || error.response?.data?.message || "Failed to delete notification";
  }
};

/* ===== MASTER PROFILE ===== */
export const getMasterProfile = async () => {
  try {
    const response = await api.get("/api/superadmin/profile");
    return response.data;
  } catch (error) {
    throw error.response?.data?.detail || error.response?.data?.message || "Failed to fetch master profile";
  }
};


export const getCompanies = async () => {
  try {
    const response = await api.get("/master/companies");
    return response.data;
  } catch (error) {
    throw error.response?.data?.detail || error.response?.data?.message || "Failed to fetch companies list";
  }
};

export const createTenant = async (data) => {
  try {
    const response = await api.post("/master/tenants", data);
    return response.data;
  } catch (error) {
    throw error.response?.data?.detail || error.response?.data?.message || "Failed to provision new tenant superadmin account";
  }
};

export const updateCompany = async (companyId, data) => {
  try {
    const response = await api.put(`/master/companies/${companyId}`, data);
    return response.data;
  } catch (error) {
    throw error.response?.data?.detail || error.response?.data?.message || "Failed to update company information";
  }
};

export const setCompanyLogin = async (companyId, data) => {
  try {
    const response = await api.post(`/master/companies/${companyId}/login`, data);
    return response.data;
  } catch (error) {
    throw error.response?.data?.detail || error.response?.data?.message || "Failed to update tenant login authorization state";
  }
};

export const deleteCompany = async (companyId) => {
  try {
    const response = await api.delete(`/master/companies/${companyId}`);
    return response.data;
  } catch (error) {
    throw error.response?.data?.detail || error.response?.data?.message || "Failed to remove company tenant";
  }
};

export const getAllPlansMaster = async () => {
  try {
    const response = await api.get("/master/plans");
    return response.data;
  } catch (error) {
    throw error.response?.data?.detail || error.response?.data?.message || "Failed to retrieve plans list";
  }
};

export const upsertPlan = async (data) => {
  try {
    const response = await api.post("/master/plans", data);
    return response.data;
  } catch (error) {
    throw error.response?.data?.detail || error.response?.data?.message || "Failed to save plan attributes";
  }
};

export const deletePlan = async (planId) => {
  try {
    const response = await api.delete(`/master/plans/${planId}`);
    return response.data;
  } catch (error) {
    throw error.response?.data?.detail || error.response?.data?.message || "Failed to delete plan definition";
  }
};

export const getAllAdmins = async () => {
  try {
    const response = await api.get("/master/admins");
    return response.data;
  } catch (error) {
    throw error.response?.data?.detail || error.response?.data?.message || "Failed to fetch master admin parameters";
  }
};

export const toggleAdminLogin = async (adminId) => {
  try {
    const response = await api.put(`/master/admins/${adminId}/toggle-login`);
    return response.data;
  } catch (error) {
    throw error.response?.data?.detail || error.response?.data?.message || "Failed to toggle sub-admin login authorization";
  }
};

/* =============================================================================
   PAYMENTS & RAZORPAY
============================================================================= */
export const createRazorpayOrder = async (data) => {
  try {
    const response = await api.post("/api/razorpay/create-order", data);
    return response.data;
  } catch (error) {
    throw error.response?.data?.detail || error.response?.data?.message || "Failed to initialize Razorpay checkout transaction";
  }
};

export const verifyRazorpayPayment = async (data) => {
  try {
    const response = await api.post("/api/razorpay/verify-payment", data);
    return response.data;
  } catch (error) {
    throw error.response?.data?.detail || error.response?.data?.message || "Failed to verify Razorpay signature";
  }
};

export const createRazorpayUpgradeOrder = async (data) => {
  try {
    const response = await api.post("/api/razorpay/create-upgrade-order", data);
    return response.data;
  } catch (error) {
    throw error.response?.data?.detail || error.response?.data?.message || "Failed to initialize Razorpay upgrade order";
  }
};

export const verifyRazorpayUpgrade = async (data) => {
  try {
    const response = await api.post("/api/razorpay/verify-upgrade", data);
    return response.data;
  } catch (error) {
    throw error.response?.data?.detail || error.response?.data?.message || "Upgrade signature verification failed";
  }
};

export const createStripeCheckout = async (data) => {
  try {
    const response = await api.post("/api/stripe/create-checkout-session", data);
    return response.data;
  } catch (error) {
    throw error.response?.data?.detail || error.response?.data?.message || "Failed to create Stripe checkout session";
  }
};

export const stripeWebhook = async (data) => {
  try {
    const response = await api.post("/api/stripe/webhook", data);
    return response.data;
  } catch (error) {
    throw error.response?.data?.detail || error.response?.data?.message || "Stripe webhook notification processing failed";
  }
};

/* =============================================================================
   EXPORTS & ALIAS ACTIONS
============================================================================= */
export const getAggregatedDashboardData = async (params) => {
  try {
    const response = await api.get("/dashboard", { params });
    return response.data;
  } catch (error) {
    throw error.response?.data?.detail || error.response?.data?.message || "Failed to fetch aggregated dashboard data";
  }
};

export const exportExcel = async (data) => {
  try {
    const response = await api.post("/api/export/excel", data, { responseType: "blob" });
    return response.data;
  } catch (error) {
    throw error.response?.data?.detail || error.response?.data?.message || "Failed to export excel spreadsheet";
  }
};

export const bulkDeleteCandidates = async (data) => {
  try {
    const response = await api.delete("/api/candidates/bulk", { data });
    return response.data;
  } catch (error) {
    throw error.response?.data?.detail || error.response?.data?.message || "Failed to bulk delete candidates";
  }
};

export const deleteSessionAlias = async (linkId) => {
  try {
    const response = await api.delete(`/api/interview/session/${linkId}`);
    return response.data;
  } catch (error) {
    throw error.response?.data?.detail || error.response?.data?.message || "Failed to delete candidate session";
  }
};

export const updateCreditRequestAlias = async (requestId, data) => {
  try {
    const response = await api.patch(`/api/credits/request/${requestId}`, data);
    return response.data;
  } catch (error) {
    throw error.response?.data?.detail || error.response?.data?.message || "Failed to update credit request parameters";
  }
};

export default api;

