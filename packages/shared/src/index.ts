export * from "./providers";
export * from "./conversations";
export * from "./tasks";
export * from "./tools";

export const API_PREFIX = "/v1";

export const WS_USER_PATH = "/v1/ws";
export const WS_AGENT_PATH = "/v1/agent/ws";

/** endpoints de provider, usados por desktop e mobile */
export const routes = {
  health: "/v1/health",
  me: "/v1/me",
  providers: "/v1/providers",
  conversations: "/v1/conversations",
  conversation: (id: string) => `/v1/conversations/${id}`,
  conversationMessages: (id: string) => `/v1/conversations/${id}/messages`,
  provider: (id: string) => `/v1/providers/${id}`,
  providerTest: (id: string) => `/v1/providers/${id}/test`,
  providerModels: (id: string) => `/v1/providers/${id}/models`,
  devices: "/v1/devices",
  deviceRegister: "/v1/devices",
  deviceWorkspaces: (id: string) => `/v1/devices/${id}/workspaces`,
  deviceClaimTask: (id: string) => `/v1/devices/${id}/tasks/claim`,
  device: (id: string) => `/v1/devices/${id}`,
  pairingCreate: "/v1/devices/pairings",
  pairingClaim: "/v1/pairings/claim",
  workspaces: "/v1/workspaces",
  tasks: "/v1/tasks",
  task: (id: string) => `/v1/tasks/${id}`,
  taskCancel: (id: string) => `/v1/tasks/${id}/cancel`,
  taskEvents: (id: string) => `/v1/tasks/${id}/events`,
  taskArtifacts: (id: string) => `/v1/tasks/${id}/artifacts`,
  approvalApprove: (id: string) => `/v1/approvals/${id}/approve`,
  approvalDeny: (id: string) => `/v1/approvals/${id}/deny`,
  artifact: (id: string) => `/v1/artifacts/${id}`,
  artifactContent: (id: string) => `/v1/artifacts/${id}/content`,
} as const;
