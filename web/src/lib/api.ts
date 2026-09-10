// Typed client for the CharmQuark backend. All calls go to /api/* which next.config.mjs
// proxies to FastAPI. The logged-in user's role/name are sent as headers so the
// backend enforces role-group permissions.
import { getUser } from "./session";
import type {
  AcceptProposalResult,
  AutoFillResult,
  CatalogApplyResult,
  CatalogDiff,
  CloudStatus,
  Device,
  DeviceFleet,
  CharmQuarkDocument,
  InstructionVersion,
  InventoryItem,
  Lab,
  Operator,
  Robot,
  RobotSwap,
  QARun,
  Readiness,
  Session,
  SessionAssign,
  SessionProposal,
  Study,
  Task,
  TaskDetail,
  TaskGroup,
  TaskInstructions,
  UploadResult,
  User,
  WorkflowContent,
  WorkflowSummary,
} from "./types";

const BASE = "/api";

export class ApiError extends Error {
  status: number;
  detail: unknown;
  constructor(status: number, detail: unknown) {
    super(typeof detail === "string" ? detail : `API ${status}`);
    this.status = status;
    this.detail = detail;
  }
  /** Human-readable message for toasts (handles 403 role errors + 409 readiness). */
  get friendly(): string {
    const d = this.detail as { detail?: unknown };
    const inner = d?.detail ?? this.detail;
    if (typeof inner === "string") return inner;
    if (inner && typeof inner === "object" && "message" in inner) {
      return String((inner as { message: unknown }).message);
    }
    return `Request failed (${this.status})`;
  }
}

function authHeaders(): Record<string, string> {
  const u = getUser();
  return u ? { "X-CharmQuark-Role": u.role, "X-CharmQuark-User": u.name } : {};
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...authHeaders() },
    cache: "no-store",
    ...init,
  });
  if (!res.ok) {
    let detail: unknown;
    try {
      detail = await res.json();
    } catch {
      detail = await res.text();
    }
    throw new ApiError(res.status, detail);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

const post = <T>(p: string, body: unknown) => req<T>(p, { method: "POST", body: JSON.stringify(body) });
const patch = <T>(p: string, body: unknown) => req<T>(p, { method: "PATCH", body: JSON.stringify(body) });
const put = <T>(p: string, body: unknown) => req<T>(p, { method: "PUT", body: JSON.stringify(body) });
const del = (p: string) => req<void>(p, { method: "DELETE" });

export const api = {
  // studies
  listStudies: () => req<Study[]>("/studies"),
  getStudy: (id: string) => req<Study>(`/studies/${id}`),
  createStudy: (b: { name: string; study_type: string; target_n?: number }) => post<Study>("/studies", b),
  updateStudy: (id: string, b: Partial<{ name: string; status: string; target_n: number }>) =>
    patch<Study>(`/studies/${id}`, b),
  deleteStudy: (id: string) => del(`/studies/${id}`),

  // catalog
  listTaskGroups: (studyId: string) => req<TaskGroup[]>(`/studies/${studyId}/task-groups`),
  getTaskGroup: (id: string) => req<TaskGroup>(`/task-groups/${id}`),
  createTaskGroup: (b: { study_id: string; name: string }) => post<TaskGroup>("/task-groups", b),
  listTasks: (studyId: string) => req<Task[]>(`/studies/${studyId}/tasks`),
  getTask: (id: string) => req<TaskDetail>(`/tasks/${id}`),
  createTask: (b: Record<string, unknown>) => post<Task>("/tasks", b),
  updateTask: (id: string, b: Record<string, unknown>) => patch<Task>(`/tasks/${id}`, b),
  deleteTask: (id: string) => del(`/tasks/${id}`),
  assessRisk: (id: string) =>
    post<{ risk_level: string; rationale: string; matched_terms: string[]; needs_legal_review: boolean }>(
      `/tasks/${id}/assess-risk`, {},
    ),
  legalReview: (id: string, approved: boolean, note?: string) =>
    post<Task>(`/tasks/${id}/legal-review`, { approved, note }),

  // task instructions (robot operator-facing .txt/JSON template + version history)
  getInstructions: (taskId: string) => req<TaskInstructions>(`/tasks/${taskId}/instructions`),
  saveInstructions: (
    taskId: string,
    b: { content: string; format: "txt" | "json"; uploaded_by?: string; notes?: string },
  ) => req<TaskInstructions>(`/tasks/${taskId}/instructions`, { method: "PUT", body: JSON.stringify(b) }),
  getInstructionVersion: (taskId: string, versionId: string) =>
    req<Pick<InstructionVersion, "version_id" | "version_number"> & { content: string }>(
      `/tasks/${taskId}/instructions/versions/${versionId}`,
    ),
  deleteInstructionVersion: (taskId: string, versionId: string) =>
    del(`/tasks/${taskId}/instructions/versions/${versionId}`),

  // vault (documents / recordings)
  listDocuments: (params?: { linked_entity_type?: string; linked_entity_id?: string; vault_category?: string }) => {
    const qs = new URLSearchParams(params as Record<string, string>).toString();
    return req<CharmQuarkDocument[]>(`/documents${qs ? `?${qs}` : ""}`);
  },
  uploadDocument: (b: {
    filename: string; content_b64: string; mime_type?: string;
    vault_category?: string; linked_entity_type?: string; linked_entity_id?: string;
  }) => post<CharmQuarkDocument>("/documents", b),
  deleteDocument: (id: string) => del(`/documents/${id}`),
  documentContentUrl: (id: string) => `/api/documents/${id}/content`,

  // resources
  listRobots: () => req<Robot[]>("/robots"),
  getRobot: (id: string) => req<Robot>(`/robots/${id}`),
  createRobot: (b: Record<string, unknown>) => post<Robot>("/robots", b),
  updateRobot: (id: string, b: Record<string, unknown>) => patch<Robot>(`/robots/${id}`, b),
  deleteRobot: (id: string) => del(`/robots/${id}`),
  listOperators: () => req<Operator[]>("/operators"),
  getOperator: (id: string) => req<Operator>(`/operators/${id}`),
  createOperator: (b: Record<string, unknown>) => post<Operator>("/operators", b),
  updateOperator: (id: string, b: Record<string, unknown>) => patch<Operator>(`/operators/${id}`, b),
  deleteOperator: (id: string) => del(`/operators/${id}`),
  listLabs: () => req<Lab[]>("/labs"),
  getLab: (id: string) => req<Lab>(`/labs/${id}`),
  createLab: (b: Record<string, unknown>) => post<Lab>("/labs", b),
  updateLab: (id: string, b: Record<string, unknown>) => patch<Lab>(`/labs/${id}`, b),
  deleteLab: (id: string) => del(`/labs/${id}`),
  listDevices: () => req<Device[]>("/devices"),
  getDevice: (id: string) => req<Device>(`/devices/${id}`),
  createDevice: (b: Record<string, unknown>) => post<Device>("/devices", b),
  updateDevice: (id: string, b: Record<string, unknown>) => patch<Device>(`/devices/${id}`, b),
  deleteDevice: (id: string) => del(`/devices/${id}`),
  listAllDeviceFleets: () => req<DeviceFleet[]>("/device-fleets"),
  listDeviceFleets: (studyId: string) => req<DeviceFleet[]>(`/studies/${studyId}/device-fleets`),
  getDeviceFleet: (id: string) => req<DeviceFleet>(`/device-fleets/${id}`),
  createDeviceFleet: (b: { study_id: string; name: string; device_ids: string[] }) =>
    post<DeviceFleet>("/device-fleets", b),
  listInventoryItems: (studyId: string) => req<InventoryItem[]>(`/studies/${studyId}/inventory-items`),
  getInventoryItem: (id: string) => req<InventoryItem>(`/inventory-items/${id}`),
  createInventoryItem: (b: Record<string, unknown>) => post<InventoryItem>("/inventory-items", b),
  deleteInventoryItem: (id: string) => del(`/inventory-items/${id}`),

  // sessions / scheduling
  listSessions: (studyId: string, start: string, end: string) =>
    req<Session[]>(`/studies/${studyId}/sessions?start=${start}&end=${end}`),
  listSessionsBy: (params: Record<string, string>) => {
    const qs = new URLSearchParams(params).toString();
    return req<Session[]>(`/sessions${qs ? `?${qs}` : ""}`);
  },
  createSession: (b: { study_id: string; slot_date?: string; slot_time?: string }) => post<Session>("/sessions", b),
  getSession: (id: string) => req<Session>(`/sessions/${id}`),
  assignSession: (id: string, b: SessionAssign) => patch<Session>(`/sessions/${id}`, b),
  getReadiness: (id: string) => req<Readiness>(`/sessions/${id}/readiness`),
  confirmSession: (id: string) => post<Session>(`/sessions/${id}/confirm`, {}),
  robotCancel: (id: string) => post<RobotSwap>(`/sessions/${id}/robot-cancel`, {}),
  advanceSession: (id: string) => post<Session>(`/sessions/${id}/advance`, {}),
  deleteSession: (id: string) => del(`/sessions/${id}`),

  // robot operator "execute session" field log (per task in the session)
  setTaskExecution: (
    sessionId: string,
    taskId: string,
    b: { done?: boolean | null; note?: string | null; variant_code?: string | null },
  ) => put<Session>(`/sessions/${sessionId}/execution/${taskId}`, b),

  // QA
  getQA: (sessionId: string) => req<QARun>(`/sessions/${sessionId}/qa`),
  createQA: (sessionId: string) => post<QARun>(`/sessions/${sessionId}/qa`, {}),
  updateQACheck: (sessionId: string, gate_index: number, check_index: number, result: string) =>
    patch<QARun>(`/sessions/${sessionId}/qa/check`, { gate_index, check_index, result }),

  // autoschedule (automated session scheduling)
  createProposal: (b: { study_id: string; slot_date?: string | null; slot_time?: string | null; budget?: number }) =>
    post<SessionProposal>("/session-proposals", b),
  rejectProposal: (sessionId: string) => post<SessionProposal>(`/sessions/${sessionId}/reject-proposal`, {}),
  acceptProposal: (
    sessionId: string,
    b: { robot_id?: string | null; payload?: string | null; session_lab?: string | null },
  ) => post<AcceptProposalResult>(`/sessions/${sessionId}/accept-proposal`, b),
  uploadSessionCsv: (sessionId: string, b: { completed_task_ids?: string[]; csv_text?: string }) =>
    post<UploadResult>(`/sessions/${sessionId}/upload-csv`, b),
  autoFill: (studyId: string, b: { start: string; end: string; budget?: number }) =>
    post<AutoFillResult>(`/studies/${studyId}/auto-fill`, b),

  // catalog sync (CSV round-trip: export -> edit in a spreadsheet -> upsert)
  exportCatalogCsv: async (studyId: string): Promise<string> => {
    const res = await fetch(`${BASE}/studies/${studyId}/catalog.csv`, {
      headers: { ...authHeaders() },
      cache: "no-store",
    });
    if (!res.ok) {
      let detail: unknown;
      try {
        detail = await res.json();
      } catch {
        detail = await res.text();
      }
      throw new ApiError(res.status, detail);
    }
    return res.text();
  },
  previewCatalog: (studyId: string, csvText: string) =>
    post<CatalogDiff>(`/studies/${studyId}/catalog/preview`, { csv_text: csvText }),
  applyCatalog: (studyId: string, csvText: string) =>
    post<CatalogApplyResult>(`/studies/${studyId}/catalog/apply`, { csv_text: csvText }),

  // dev / sample data
  seedSample: () => post<Session>("/dev/seed/sample", {}),
  seedDemo: () => post<{ study_id: string; tasks: number; robots: number; standby: number; confirmed_sessions: number }>("/dev/seed/demo", {}),

  // cloud connectivity (database backing + reachability)
  getCloudStatus: () => req<CloudStatus>("/cloud/status"),

  // BPMN workflow diagrams (Docs/workflows/*.bpmn) — read/edit in the designer
  listWorkflows: () => req<WorkflowSummary[]>("/workflows"),
  getWorkflow: (id: string) => req<WorkflowContent>(`/workflows/${id}`),
  saveWorkflow: (id: string, xml: string) => put<WorkflowContent>(`/workflows/${id}`, { xml }),
  createWorkflow: (name: string) => post<WorkflowContent>("/workflows", { name }),

  // users (RBAC admin)
  listUsers: () => req<User[]>("/users"),
  createUser: (b: { subject: string; name: string; email?: string; role: string }) => post<User>("/users", b),
  updateUser: (id: string, b: Record<string, unknown>) => patch<User>(`/users/${id}`, b),
  deleteUser: (id: string) => del(`/users/${id}`),
};
