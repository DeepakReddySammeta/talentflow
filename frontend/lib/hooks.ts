import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "./authContext";
import { apiRequest, apiUpload } from "./apiClient";
import {
  AdminUser,
  Candidate,
  ConversationMessage,
  ConversationSummary,
  DashboardStats,
  FeatureFlag,
  ImportJobResult,
  Interview,
  InterviewerSlot,
  Job,
  Notification,
  Offer,
  PaginatedResponse,
  PipelineStageRef,
  Recommendation,
  SearchResult,
  Skill,
  SkillCategory,
} from "./types";

// ---- Helpers ----

function buildQuery(params: Record<string, string | number | undefined | null>) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

// ---- Users ----

export interface UserParams {
  page?: number;
  limit?: number;
  search?: string;
  role?: string;
  status?: "active" | "archived";
}

export function useUsers(params: UserParams = {}) {
  return useQuery({
    queryKey: ["users", params],
    queryFn: () =>
      apiRequest<PaginatedResponse<AdminUser>>(`/users${buildQuery({ page: params.page ?? 1, limit: params.limit ?? 20, search: params.search, role: params.role, status: params.status ?? "active" })}`),
  });
}

export function useUser(id: string | null) {
  return useQuery({
    queryKey: ["user", id],
    queryFn: () => apiRequest<AdminUser>(`/users/${id}`),
    enabled: !!id,
  });
}

export function useCreateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { name: string; email: string; password: string; role: string; roles?: string[]; department?: string }) =>
      apiRequest("/users", { method: "POST", body: payload }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["users"] }),
  });
}

export function useUpdateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; name?: string; email?: string; role?: string; roles?: string[]; department?: string | null }) =>
      apiRequest(`/users/${id}`, { method: "PATCH", body: data }),
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      queryClient.invalidateQueries({ queryKey: ["user", vars.id] });
    },
  });
}

export function useArchiveUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiRequest(`/users/${id}/archive`, { method: "PATCH" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["users"] }),
  });
}

export function useRestoreUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiRequest(`/users/${id}/restore`, { method: "PATCH" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["users"] }),
  });
}

export function useImportUsers() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => apiUpload<ImportJobResult>("/import/users", file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      queryClient.invalidateQueries({ queryKey: ["import-jobs"] });
    },
  });
}

// ---- Jobs ----

export interface JobParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  department?: string;
  // Job already has its own lifecycle `status` (OPEN/CLOSED/...), so
  // archival uses a separate param name rather than colliding with it —
  // unlike Users, which has no other "status" concept.
  archived?: "active" | "archived";
}

export function useJobs(params: JobParams = {}) {
  return useQuery({
    queryKey: ["jobs", params],
    queryFn: () =>
      apiRequest<PaginatedResponse<Job>>(`/jobs${buildQuery({ page: params.page ?? 1, limit: params.limit ?? 20, search: params.search, status: params.status, department: params.department, archived: params.archived ?? "active" })}`),
  });
}

export function useJob(id: string | null) {
  return useQuery({
    queryKey: ["job", id],
    queryFn: () => apiRequest<Job>(`/jobs/${id}`),
    enabled: !!id,
  });
}

export function useJobCandidates(jobId: string | null, page = 1, limit = 20) {
  return useQuery({
    queryKey: ["job-candidates", jobId, page, limit],
    queryFn: () => apiRequest<PaginatedResponse<Candidate>>(`/jobs/${jobId}/candidates?page=${page}&limit=${limit}`),
    enabled: !!jobId,
  });
}

export function useJobInterviews(jobId: string | null, page = 1, limit = 20) {
  return useQuery({
    queryKey: ["job-interviews", jobId, page, limit],
    queryFn: () => apiRequest<PaginatedResponse<Interview>>(`/jobs/${jobId}/interviews?page=${page}&limit=${limit}`),
    enabled: !!jobId,
  });
}

export interface CreateJobPayload {
  title: string;
  department: string;
  status?: string;
  description?: string;
  employmentType?: string;
  jobLevel?: string;
  payMin?: number;
  payMax?: number;
  payCurrency?: string;
  stages: { name: string; kras: string[] }[];
  skillIds?: string[];
}

export function useCreateJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateJobPayload) =>
      apiRequest("/jobs", { method: "POST", body: payload }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["jobs"] }),
  });
}

export interface UpdateJobPayload {
  id: string;
  title?: string;
  department?: string;
  status?: string;
  description?: string;
  employmentType?: string | null;
  jobLevel?: string | null;
  payMin?: number | null;
  payMax?: number | null;
  payCurrency?: string | null;
  stages?: { name: string; kras: string[] }[];
  skillIds?: string[];
}

export function useUpdateJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: UpdateJobPayload) =>
      apiRequest(`/jobs/${id}`, { method: "PATCH", body: data }),
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      queryClient.invalidateQueries({ queryKey: ["job", vars.id] });
    },
  });
}

export function useArchiveJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiRequest(`/jobs/${id}/archive`, { method: "PATCH" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["jobs"] }),
  });
}

export function useRestoreJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiRequest(`/jobs/${id}/restore`, { method: "PATCH" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["jobs"] }),
  });
}

export function useJobPipeline(jobId: string | null) {
  return useQuery({
    queryKey: ["job-pipeline", jobId],
    queryFn: () => apiRequest<PipelineStageRef[]>(`/jobs/${jobId}/pipeline`),
    enabled: !!jobId,
  });
}

// ---- Candidates ----

export interface CandidateParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  jobId?: string;
  skillId?: string;
  skillCategory?: string;
  archived?: "active" | "archived";
}

export function useCandidates(params: CandidateParams = {}) {
  return useQuery({
    queryKey: ["candidates", params],
    queryFn: () =>
      apiRequest<PaginatedResponse<Candidate>>(`/candidates${buildQuery({
        page: params.page ?? 1, limit: params.limit ?? 20, search: params.search, status: params.status,
        jobId: params.jobId, skillId: params.skillId, skillCategory: params.skillCategory,
        archived: params.archived ?? "active",
      })}`),
  });
}

export function useCandidate(id: string | null) {
  return useQuery({
    queryKey: ["candidate", id],
    queryFn: () => apiRequest<Candidate>(`/candidates/${id}`),
    enabled: !!id,
  });
}

export function useCandidateDebrief(candidateId: string | null) {
  return useQuery({
    queryKey: ["candidate-debrief", candidateId],
    queryFn: () => apiRequest<Candidate & { interviews: Interview[] }>(`/candidates/${candidateId}/debrief`),
    enabled: !!candidateId,
  });
}

export function useCreateCandidate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { name: string; email: string; jobId: string; skillIds?: string[]; phone?: string; location?: string; experience?: number; linkedinUrl?: string; portfolioUrl?: string }) =>
      apiRequest("/candidates", { method: "POST", body: payload }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["candidates"] }),
  });
}

export function useUpdateCandidate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; [key: string]: any }) =>
      apiRequest(`/candidates/${id}`, { method: "PATCH", body: data }),
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ["candidates"] });
      queryClient.invalidateQueries({ queryKey: ["candidate", vars.id] });
      queryClient.invalidateQueries({ queryKey: ["candidate-debrief", vars.id] });
    },
  });
}

export function useArchiveCandidate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiRequest(`/candidates/${id}/archive`, { method: "PATCH" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["candidates"] }),
  });
}

export function useRestoreCandidate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiRequest(`/candidates/${id}/restore`, { method: "PATCH" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["candidates"] }),
  });
}

export function useImportCandidates() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => apiUpload<ImportJobResult>("/import/candidates", file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["candidates"] });
      queryClient.invalidateQueries({ queryKey: ["import-jobs"] });
    },
  });
}

// ---- Interviews ----

export interface InterviewParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  jobId?: string;
  candidateId?: string;
  interviewerId?: string;
  round?: number;
  archived?: "active" | "archived";
}

export function useInterviews(params: InterviewParams = {}) {
  return useQuery({
    queryKey: ["interviews", params],
    queryFn: () =>
      apiRequest<PaginatedResponse<Interview>>(`/interviews${buildQuery({ page: params.page ?? 1, limit: params.limit ?? 20, ...params, archived: params.archived ?? "active" })}`),
  });
}

export function useCreateInterview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { candidateId: string; jobId: string; interviewerId: string; stageId?: string; round: number; scheduledAt: string }) =>
      apiRequest("/interviews", { method: "POST", body: payload }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["interviews"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

export function useRescheduleInterview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, scheduledAt, interviewerId }: { id: string; scheduledAt: string; interviewerId?: string }) =>
      apiRequest(`/interviews/${id}/reschedule`, { method: "PATCH", body: { scheduledAt, interviewerId } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["interviews"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

export function useSubmitScorecard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ interviewId, recommendation, kraRatings, notes }: { interviewId: string; recommendation: Recommendation; kraRatings: Record<string, number>; notes: string }) =>
      apiRequest(`/interviews/${interviewId}/scorecard`, { method: "POST", body: { recommendation, kraRatings, notes } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["interviews"] });
      queryClient.invalidateQueries({ queryKey: ["candidates"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

export function useArchiveInterview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiRequest(`/interviews/${id}/archive`, { method: "PATCH" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["interviews"] }),
  });
}

export function useRestoreInterview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiRequest(`/interviews/${id}/restore`, { method: "PATCH" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["interviews"] }),
  });
}

export function useInterviewerSlots(interviewerId?: string, month?: string) {
  return useQuery({
    queryKey: ["interviewer-slots", interviewerId, month],
    queryFn: () => apiRequest<InterviewerSlot[]>(`/interviews/slots${buildQuery({ interviewerId, month })}`),
    enabled: !!interviewerId || true,
  });
}

export function useCreateSlot() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { date: string; note?: string; interviewerId?: string }) =>
      apiRequest("/interviews/slots", { method: "POST", body: payload }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["interviewer-slots"] }),
  });
}

export function useDeleteSlot() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiRequest(`/interviews/slots/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["interviewer-slots"] }),
  });
}

// ---- Offers ----

export function useOffers(archived: "active" | "archived" = "active") {
  return useQuery({
    queryKey: ["offers", archived],
    queryFn: () => apiRequest<Offer[]>(`/offers${buildQuery({ archived })}`),
  });
}

export function useApproveOffer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiRequest(`/offers/${id}/approve`, { method: "PATCH" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["offers"] }),
  });
}

export function useUpdateOffer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; salary?: number; status?: string }) =>
      apiRequest(`/offers/${id}`, { method: "PATCH", body: data }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["offers"] }),
  });
}

export function useArchiveOffer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiRequest(`/offers/${id}/archive`, { method: "PATCH" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["offers"] }),
  });
}

export function useRestoreOffer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiRequest(`/offers/${id}/restore`, { method: "PATCH" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["offers"] }),
  });
}

// ---- Import / Export tracking ----

export function useAllImportJobs() {
  return useQuery({
    queryKey: ["import-jobs"],
    queryFn: () => apiRequest<ImportJobResult[]>("/import/list"),
  });
}

export function useImportJobDetail(jobId: string | null) {
  return useQuery({
    queryKey: ["import-job", jobId],
    queryFn: () => apiRequest<ImportJobResult>(`/import/${jobId}`),
    enabled: !!jobId,
  });
}

// Legacy alias
export function useImportJobs() {
  return useQuery({
    queryKey: ["import-jobs"],
    queryFn: () => apiRequest<ImportJobResult[]>("/import/list"),
  });
}

// ---- Notifications ----

export function useNotifications() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["notifications"],
    queryFn: () => apiRequest<Notification[]>("/notifications"),
    refetchInterval: 30_000,
    enabled: !!user,
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiRequest(`/notifications/${id}/read`, { method: "PATCH" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiRequest("/notifications/read-all", { method: "PATCH" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });
}

// ---- Feature flags ----

export function useFeatureFlags() {
  return useQuery({
    queryKey: ["feature-flags"],
    queryFn: () => apiRequest<FeatureFlag[]>("/feature-flags"),
    staleTime: 60_000,
  });
}

export function useSetFeatureFlag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ key, enabled }: { key: string; enabled: boolean }) =>
      apiRequest(`/feature-flags/${key}`, { method: "PATCH", body: { enabled } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["feature-flags"] }),
  });
}

// ---- Dashboard ----

export function useDashboardStats() {
  return useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: () => apiRequest<DashboardStats>("/dashboard/stats"),
  });
}

// ---- Conversations ----

export function useConversations() {
  return useQuery({
    queryKey: ["conversations"],
    queryFn: () => apiRequest<ConversationSummary[]>("/conversations"),
  });
}

export function useConversationMessages(conversationId: string | null) {
  return useQuery({
    queryKey: ["conversation-messages", conversationId],
    queryFn: () => apiRequest<ConversationMessage[]>(`/conversations/${conversationId}/messages`),
    enabled: !!conversationId,
  });
}

// ---- Skills ----

export function useSkills(category?: SkillCategory, search?: string) {
  return useQuery({
    queryKey: ["skills", category, search],
    // GET /skills now returns {data,total,page,limit} like every other list
    // route (limit defaults to 200 server-side — this page is a "browse
    // everything in this category" chip cloud, not a paged table, so the
    // hook just unwraps .data rather than exposing pager state no caller uses).
    queryFn: async () => {
      const res = await apiRequest<PaginatedResponse<Skill>>(`/skills${buildQuery({ category, search })}`);
      return res.data;
    },
  });
}

export function useCreateSkill() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { name: string; category: SkillCategory; description?: string }) =>
      apiRequest<Skill>("/skills", { method: "POST", body: payload }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["skills"] }),
  });
}

export function useUpdateSkill() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; name?: string; category?: SkillCategory; description?: string }) =>
      apiRequest<Skill>(`/skills/${id}`, { method: "PATCH", body: data }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["skills"] }),
  });
}

export function useDeleteSkill() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiRequest(`/skills/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["skills"] }),
  });
}

// ---- Search ----

export function useAgenticSearch() {
  return useMutation({
    mutationFn: (prompt: string) => apiRequest<SearchResult>("/search", { method: "POST", body: { prompt } }),
  });
}
