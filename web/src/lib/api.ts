// Typed client for the CharmQuark backend. All calls go to /api/* which next.config.mjs
// proxies to FastAPI. The logged-in user's role/name are sent as headers so the
// backend enforces role-group permissions.
import { getUser } from "./session";
import type {
  AcceptProposalResult,
  BillingAccount,
  CheckoutClaim,
  CheckoutStart,
  LedgerEntry,
  AutoFillResult,
  CatalogApplyResult,
  CatalogDiff,
  CoverageCell,
  CoverageReport,
  CoverageSpace,
  CloudStatus,
  Sensor,
  SensorRig,
  CharmQuarkDocument,
  InstructionVersion,
  InventoryItem,
  Lab,
  Operator,
  Robot,
  RobotSwap,
  QARun,
  RoboflowExport,
  RoboflowStatus,
  Readiness,
  Run,
  RunAssign,
  RunProposal,
  Campaign,
  Mission,
  MissionDetail,
  MissionGroup,
  MissionInstructions,
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

/** Fired when any API call comes back 402; BillingProvider listens for it. */
export const OUT_OF_CREDITS_EVENT = "charmquark-out-of-credits";

function authHeaders(): Record<string, string> {
  const u = getUser();
  return u ? { "X-CharmQuark-Role": u.role, "X-CharmQuark-User": u.name } : {};
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...authHeaders() },
    cache: "no-store",
    credentials: "same-origin",
    ...init,
  });
  if (!res.ok) {
    let detail: unknown;
    try {
      detail = await res.json();
    } catch {
      detail = await res.text();
    }
    const err = new ApiError(res.status, detail);
    // Out of run credits. Announced app-wide so the purchase modal opens from
    // wherever the metered action was attempted, rather than every call site
    // having to know about billing. The error still throws: the caller decides
    // what else to do (and suppresses its own toast on 402).
    if (res.status === 402 && typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(OUT_OF_CREDITS_EVENT, { detail: err.friendly }));
    }
    throw err;
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

const post = <T>(p: string, body: unknown) => req<T>(p, { method: "POST", body: JSON.stringify(body) });
const patch = <T>(p: string, body: unknown) => req<T>(p, { method: "PATCH", body: JSON.stringify(body) });
const put = <T>(p: string, body: unknown) => req<T>(p, { method: "PUT", body: JSON.stringify(body) });
const del = (p: string) => req<void>(p, { method: "DELETE" });

export const api = {
  // campaigns
  listCampaigns: () => req<Campaign[]>("/campaigns"),
  getCampaign: (id: string) => req<Campaign>(`/campaigns/${id}`),
  createCampaign: (b: { name: string; campaign_type: string; target_n?: number }) => post<Campaign>("/campaigns", b),
  updateCampaign: (id: string, b: Partial<{ name: string; status: string; target_n: number }>) =>
    patch<Campaign>(`/campaigns/${id}`, b),
  deleteCampaign: (id: string) => del(`/campaigns/${id}`),

  // catalog
  listMissionGroups: (campaignId: string) => req<MissionGroup[]>(`/campaigns/${campaignId}/mission-groups`),
  getMissionGroup: (id: string) => req<MissionGroup>(`/mission-groups/${id}`),
  createMissionGroup: (b: { campaign_id: string; name: string }) => post<MissionGroup>("/mission-groups", b),
  listMissions: (campaignId: string) => req<Mission[]>(`/campaigns/${campaignId}/missions`),
  getMission: (id: string) => req<MissionDetail>(`/missions/${id}`),
  createMission: (b: Record<string, unknown>) => post<Mission>("/missions", b),
  updateMission: (id: string, b: Record<string, unknown>) => patch<Mission>(`/missions/${id}`, b),
  deleteMission: (id: string) => del(`/missions/${id}`),
  assessRisk: (id: string) =>
    post<{ risk_level: string; rationale: string; matched_terms: string[]; needs_legal_review: boolean }>(
      `/missions/${id}/assess-risk`, {},
    ),
  legalReview: (id: string, approved: boolean, note?: string) =>
    post<Mission>(`/missions/${id}/legal-review`, { approved, note }),

  // mission instructions (robot operator-facing .txt/JSON template + version history)
  getInstructions: (missionId: string) => req<MissionInstructions>(`/missions/${missionId}/instructions`),
  saveInstructions: (
    missionId: string,
    b: { content: string; format: "txt" | "json"; uploaded_by?: string; notes?: string },
  ) => req<MissionInstructions>(`/missions/${missionId}/instructions`, { method: "PUT", body: JSON.stringify(b) }),
  getInstructionVersion: (missionId: string, versionId: string) =>
    req<Pick<InstructionVersion, "version_id" | "version_number"> & { content: string }>(
      `/missions/${missionId}/instructions/versions/${versionId}`,
    ),
  deleteInstructionVersion: (missionId: string, versionId: string) =>
    del(`/missions/${missionId}/instructions/versions/${versionId}`),

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
  listSensors: () => req<Sensor[]>("/sensors"),
  getSensor: (id: string) => req<Sensor>(`/sensors/${id}`),
  createSensor: (b: Record<string, unknown>) => post<Sensor>("/sensors", b),
  updateSensor: (id: string, b: Record<string, unknown>) => patch<Sensor>(`/sensors/${id}`, b),
  deleteSensor: (id: string) => del(`/sensors/${id}`),
  listAllSensorRigs: () => req<SensorRig[]>("/sensor-rigs"),
  listSensorRigs: (campaignId: string) => req<SensorRig[]>(`/campaigns/${campaignId}/sensor-rigs`),
  getSensorRig: (id: string) => req<SensorRig>(`/sensor-rigs/${id}`),
  createSensorRig: (b: { campaign_id: string; name: string; sensor_ids: string[] }) =>
    post<SensorRig>("/sensor-rigs", b),
  listInventoryItems: (campaignId: string) => req<InventoryItem[]>(`/campaigns/${campaignId}/inventory-items`),
  getInventoryItem: (id: string) => req<InventoryItem>(`/inventory-items/${id}`),
  createInventoryItem: (b: Record<string, unknown>) => post<InventoryItem>("/inventory-items", b),
  deleteInventoryItem: (id: string) => del(`/inventory-items/${id}`),

  // runs / scheduling
  listRuns: (campaignId: string, start: string, end: string) =>
    req<Run[]>(`/campaigns/${campaignId}/runs?start=${start}&end=${end}`),
  listRunsBy: (params: Record<string, string>) => {
    const qs = new URLSearchParams(params).toString();
    return req<Run[]>(`/runs${qs ? `?${qs}` : ""}`);
  },
  createRun: (b: { campaign_id: string; slot_date?: string; slot_time?: string }) => post<Run>("/runs", b),
  getRun: (id: string) => req<Run>(`/runs/${id}`),
  assignRun: (id: string, b: RunAssign) => patch<Run>(`/runs/${id}`, b),
  getReadiness: (id: string) => req<Readiness>(`/runs/${id}/readiness`),
  confirmRun: (id: string) => post<Run>(`/runs/${id}/confirm`, {}),
  robotCancel: (id: string) => post<RobotSwap>(`/runs/${id}/robot-cancel`, {}),
  advanceRun: (id: string) => post<Run>(`/runs/${id}/advance`, {}),
  deleteRun: (id: string) => del(`/runs/${id}`),

  // robot operator "execute run" field log (per mission in the run)
  setMissionExecution: (
    runId: string,
    missionId: string,
    b: { done?: boolean | null; note?: string | null; variant_code?: string | null },
  ) => put<Run>(`/runs/${runId}/execution/${missionId}`, b),

  // QA
  getQA: (runId: string) => req<QARun>(`/runs/${runId}/qa`),
  createQA: (runId: string) => post<QARun>(`/runs/${runId}/qa`, {}),
  /** Re-run the autocheck by listing the run's vault prefix. */
  recheckQA: (runId: string) => post<QARun>(`/runs/${runId}/qa`, { derive_from_r2: true }),
  /** Autocheck an explicit manifest — what the extraction tooling saw. */
  autocheckQA: (runId: string, manifest: unknown) => post<QARun>(`/runs/${runId}/qa`, { manifest }),
  updateQACheck: (runId: string, gate_index: number, check_index: number, result: string) =>
    patch<QARun>(`/runs/${runId}/qa/check`, { gate_index, check_index, result }),

  // Roboflow annotation handoff
  getRoboflow: (runId: string) => req<RoboflowStatus>(`/runs/${runId}/roboflow`),
  exportToRoboflow: (runId: string, b: { project: string; workspace?: string; batch?: string; split?: string; force?: boolean }) =>
    post<RoboflowExport>(`/runs/${runId}/roboflow/export`, b),
  linkRoboflowVersion: (exportId: string, dataset_version: string) =>
    patch<RoboflowExport>(`/roboflow/exports/${exportId}`, { dataset_version }),

  // autoschedule (automated run scheduling)
  createProposal: (b: { campaign_id: string; slot_date?: string | null; slot_time?: string | null; budget?: number }) =>
    post<RunProposal>("/run-proposals", b),
  rejectProposal: (runId: string) => post<RunProposal>(`/runs/${runId}/reject-proposal`, {}),
  acceptProposal: (
    runId: string,
    b: { robot_id?: string | null; payload?: string | null; run_lab?: string | null },
  ) => post<AcceptProposalResult>(`/runs/${runId}/accept-proposal`, b),
  uploadRunCsv: (runId: string, b: { completed_mission_ids?: string[]; csv_text?: string }) =>
    post<UploadResult>(`/runs/${runId}/upload-csv`, b),
  autoFill: (campaignId: string, b: { start: string; end: string; budget?: number }) =>
    post<AutoFillResult>(`/campaigns/${campaignId}/auto-fill`, b),

  // catalog sync (CSV round-trip: export -> edit in a spreadsheet -> upsert)
  exportCatalogCsv: async (campaignId: string): Promise<string> => {
    const res = await fetch(`${BASE}/campaigns/${campaignId}/catalog.csv`, {
      headers: { ...authHeaders() },
      cache: "no-store",
      credentials: "same-origin",
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
  previewCatalog: (campaignId: string, csvText: string) =>
    post<CatalogDiff>(`/campaigns/${campaignId}/catalog/preview`, { csv_text: csvText }),
  applyCatalog: (campaignId: string, csvText: string) =>
    post<CatalogApplyResult>(`/campaigns/${campaignId}/catalog/apply`, { csv_text: csvText }),

  // coverage space
  getCoverage: (campaignId: string) => req<CoverageReport>(`/campaigns/${campaignId}/coverage`),
  setCoverageSpace: (campaignId: string, space: CoverageSpace) =>
    put<CoverageReport>(`/campaigns/${campaignId}/coverage-space`, space),
  setRunCoverageCell: (runId: string, cell: CoverageCell) =>
    put<{ run_id: string; cell: CoverageCell; cell_key: string }>(`/runs/${runId}/coverage-cell`, { cell }),

  // dev / sample data
  seedSample: () => post<Run>("/dev/seed/sample", {}),
  seedDemo: () => post<{ campaign_id: string; missions: number; robots: number; standby: number; confirmed_sessions: number }>("/dev/seed/demo", {}),

  // cloud connectivity (database backing + reachability)
  getCloudStatus: () => req<CloudStatus>("/cloud/status"),

  // BPMN workflow diagrams (Docs/workflows/*.bpmn) — read/edit in the designer
  listWorkflows: () => req<WorkflowSummary[]>("/workflows"),
  getWorkflow: (id: string) => req<WorkflowContent>(`/workflows/${id}`),
  saveWorkflow: (id: string, xml: string) => put<WorkflowContent>(`/workflows/${id}`, { xml }),
  createWorkflow: (name: string) => post<WorkflowContent>("/workflows", { name }),

  // billing — metered run credits. One credit is spent when a run is confirmed.
  getBillingAccount: () => req<BillingAccount>("/billing/account"),
  listLedger: (limit = 50) => req<LedgerEntry[]>(`/billing/ledger?limit=${limit}`),
  startCheckout: (packId: string, returnPath: string) =>
    post<CheckoutStart>("/billing/checkout", { pack_id: packId, return_path: returnPath }),
  claimCheckout: (sessionId: string) =>
    req<CheckoutClaim>(`/billing/claim?session_id=${encodeURIComponent(sessionId)}`),

  // users (RBAC admin)
  listUsers: () => req<User[]>("/users"),
  createUser: (b: { subject: string; name: string; email?: string; role: string }) => post<User>("/users", b),
  updateUser: (id: string, b: Record<string, unknown>) => patch<User>(`/users/${id}`, b),
  deleteUser: (id: string) => del(`/users/${id}`),

  chat: (messages: { role: "user" | "model"; parts: { text: string }[] }[]) =>
    post<{ text: string }>("/chat", { messages }),
};
