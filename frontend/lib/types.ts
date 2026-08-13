export type Role = "ADMIN" | "HR" | "MANAGER" | "INTERVIEWER";

export type SkillCategory = "TECHNICAL" | "HUMAN" | "MANAGEMENT" | "DOMAIN";
export type SkillProficiency = "BEGINNER" | "INTERMEDIATE" | "ADVANCED" | "EXPERT";
export type EmploymentType = "FULL_TIME" | "PART_TIME" | "CONTRACT" | "FREELANCE" | "INTERNSHIP";
export type JobLevel = "INTERN" | "JUNIOR" | "MID" | "SENIOR" | "LEAD" | "MANAGER" | "DIRECTOR";
export type PayCurrency = "INR" | "USD";

export interface Skill {
  id: string;
  name: string;
  category: SkillCategory;
  description?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  department: string | null;
}

export type JobStatus = "OPEN" | "CLOSED" | "ON_HOLD" | "DRAFT" | "ARCHIVED";

export interface JobSkill {
  id: string;
  skillId: string;
  skill: Skill;
  proficiency: SkillProficiency;
}

export interface Job {
  id: string;
  title: string;
  department: string;
  status: JobStatus;
  description?: string | null;
  referenceId?: string | null;
  employmentType?: EmploymentType | null;
  jobLevel?: JobLevel | null;
  payMin?: number | null;
  payMax?: number | null;
  payCurrency?: PayCurrency | null;
  createdAt: string;
  archivedAt?: string | null;
  stages?: PipelineStageRef[];
  createdBy?: { name: string };
  skills?: JobSkill[];
  _count?: { candidates: number; stages?: number; interviews?: number; offers?: number };
}

export interface PipelineStageRef {
  id: string;
  order: number;
  name: string;
  kras: string[];
}

export interface EducationEntry {
  degree: string;
  institution: string;
  year: number;
}

export interface ProjectEntry {
  title: string;
  description: string;
  url?: string;
}

export interface Candidate {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  location?: string | null;
  experience?: number | null;
  education?: EducationEntry[] | null;
  projects?: ProjectEntry[] | null;
  linkedinUrl?: string | null;
  portfolioUrl?: string | null;
  resumeUrl?: string | null;
  // Legacy free-text column, being migrated to skillLinks (governed,
  // category-aware, mirrors Job/JobSkill). Prefer skillLinks.
  skills?: string[];
  skillLinks?: JobSkill[];
  status: string;
  jobId: string;
  archivedAt?: string | null;
  job?: Job;
  offer?: Offer;
  interviews?: Interview[];
  createdAt?: string;
}

export interface Interview {
  id: string;
  round: number;
  status: "SCHEDULED" | "CLEARED" | "REJECTED" | "NO_SHOW";
  scheduledAt: string;
  feedback: string | null;
  candidateId?: string;
  jobId?: string;
  interviewerId?: string;
  stageId?: string | null;
  candidate?: { name: string; email?: string };
  job?: { title: string; department?: string };
  interviewer?: { id?: string; name: string };
  stage?: PipelineStageRef | null;
  scorecard?: Scorecard | null;
  archivedAt?: string | null;
}

export interface Offer {
  id: string;
  salary: string;
  status: "DRAFT" | "SENT" | "ACCEPTED" | "DECLINED";
  candidate?: Candidate;
  job?: Job;
  archivedAt?: string | null;
}

export interface PipelineStage {
  id: string;
  order: number;
  name: string;
  kras: string[];
}

export type Recommendation = "STRONG_HIRE" | "HIRE" | "NO_HIRE" | "STRONG_NO_HIRE";

export interface Scorecard {
  id: string;
  recommendation: Recommendation;
  kraRatings: Record<string, number>;
  notes: string | null;
  createdAt: string;
}

export interface Notification {
  id: string;
  message: string;
  link: string | null;
  read: boolean;
  createdAt: string;
}

export interface FeatureFlag {
  key: string;
  enabled: boolean;
  updatedAt: string;
}

export interface DashboardStatsPersonal {
  scope: "personal";
  upcoming: number;
  pendingFeedback: number;
  completed: number;
}

export interface DashboardStatsCompany {
  scope: "company";
  candidatesByStatus: { status: string; _count: number }[];
  interviewsByStatus: { status: string; _count: number }[];
  offersByStatus: { status: string; _count: number }[];
  topJobs: { id: string; title: string; department: string; candidateCount: number }[];
  openJobCount: number;
}

export type DashboardStats = DashboardStatsPersonal | DashboardStatsCompany;

export interface ConversationSummary {
  id: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationMessage {
  id: string;
  role: "user" | "agent";
  content: string;
  a2uiPayload: unknown | null;
  toolTrace: unknown | null;
  createdAt: string;
}

export interface ImportRowResult {
  id: string;
  rowNumber: number;
  rawData: Record<string, unknown>;
  status: "IMPORTED" | "FAILED";
  errorReason: string | null;
  candidateId: string | null;
}

export interface ImportJobResult {
  id: string;
  fileName: string;
  type: string;
  status: "PROCESSING" | "COMPLETED" | "FAILED";
  totalRows: number;
  successCount: number;
  failureCount: number;
  createdAt: string;
  uploadedBy?: { name: string };
  rows?: ImportRowResult[];
}

export interface AgentStep {
  tool: string;
  args: Record<string, unknown>;
  resultCount: number | null;
}

export interface SearchResult {
  summary: string;
  steps: AgentStep[];
  data: any[];
}

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  roles: Role[];
  department: string | null;
  createdAt: string;
  archivedAt: string | null;
  _count?: { interviewsGiven: number };
  interviewsGiven?: Interview[];
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

export interface InterviewerSlot {
  id: string;
  interviewerId: string;
  date: string;
  note: string | null;
  createdAt: string;
}
