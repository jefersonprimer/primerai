import { z } from "zod";

export const RISK_LEVELS = ["safe", "confirm", "blocked"] as const;
export const RiskLevelSchema = z.enum(RISK_LEVELS);
export type RiskLevel = z.infer<typeof RiskLevelSchema>;

export const TOOL_NAMES = [
  "fs.list_directory",
  "fs.read_file",
  "fs.search_files",
  "fs.write_file",
  "fs.create_directory",
  "fs.move_file",
  "fs.copy_file",
  "fs.delete_path",
  "doc.create_pdf",
  "doc.create_docx",
  "doc.create_xlsx",
  "app.open",
  "shell.execute",
  "project.scaffold",
] as const;
export const ToolNameSchema = z.enum(TOOL_NAMES);
export type ToolName = z.infer<typeof ToolNameSchema>;

export const ToolSpecSchema = z.object({
  name: ToolNameSchema,
  description: z.string(),
  risk: RiskLevelSchema,
  parameters: z.record(z.string(), z.unknown()),
});
export type ToolSpec = z.infer<typeof ToolSpecSchema>;

export const TOOL_CATALOG: readonly ToolSpec[] = [
  {
    name: "fs.list_directory",
    description: "Lista o conteúdo de um diretório dentro de um workspace autorizado.",
    risk: "safe",
    parameters: {
      type: "object",
      properties: { path: { type: "string" }, recursive: { type: "boolean", default: false } },
      required: ["path"],
    },
  },
  {
    name: "fs.read_file",
    description: "Lê o conteúdo de um arquivo de texto dentro de um workspace autorizado.",
    risk: "safe",
    parameters: {
      type: "object",
      properties: { path: { type: "string" }, maxBytes: { type: "integer", default: 200_000 } },
      required: ["path"],
    },
  },
  {
    name: "fs.search_files",
    description: "Busca arquivos por nome ou por conteúdo dentro dos workspaces autorizados.",
    risk: "safe",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string" },
        root: { type: "string" },
        pattern: { type: "string", description: "glob, ex: *.pdf" },
        limit: { type: "integer", default: 50 },
      },
      required: ["query"],
    },
  },
  {
    name: "fs.write_file",
    description: "Cria ou sobrescreve um arquivo de texto.",
    risk: "safe",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string" },
        content: { type: "string" },
        mode: { type: "string", enum: ["create", "overwrite", "append"] },
      },
      required: ["path", "content", "mode"],
    },
  },
  {
    name: "fs.create_directory",
    description: "Cria um diretório, incluindo os diretórios pais necessários.",
    risk: "safe",
    parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
  },
  {
    name: "fs.move_file",
    description: "Move ou renomeia um arquivo ou diretório.",
    risk: "confirm",
    parameters: {
      type: "object",
      properties: { from: { type: "string" }, to: { type: "string" }, overwrite: { type: "boolean" } },
      required: ["from", "to"],
    },
  },
  {
    name: "fs.copy_file",
    description: "Copia um arquivo ou diretório.",
    risk: "confirm",
    parameters: {
      type: "object",
      properties: { from: { type: "string" }, to: { type: "string" } },
      required: ["from", "to"],
    },
  },
  {
    name: "fs.delete_path",
    description: "Apaga um arquivo ou diretório. Sempre exige confirmação do usuário.",
    risk: "confirm",
    parameters: {
      type: "object",
      properties: { path: { type: "string" }, recursive: { type: "boolean" } },
      required: ["path"],
    },
  },
  {
    name: "doc.create_pdf",
    description: "Gera um PDF a partir de um título e seções de texto.",
    risk: "safe",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string" },
        title: { type: "string" },
        sections: {
          type: "array",
          items: {
            type: "object",
            properties: { heading: { type: "string" }, body: { type: "string" } },
            required: ["body"],
          },
        },
      },
      required: ["path", "title", "sections"],
    },
  },
  {
    name: "doc.create_docx",
    description: "Gera um documento DOCX a partir de blocos de texto.",
    risk: "safe",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string" },
        title: { type: "string" },
        blocks: {
          type: "array",
          items: {
            type: "object",
            properties: {
              heading: { type: "string" },
              body: { type: "string" },
              list: { type: "array", items: { type: "string" } },
            },
          },
        },
      },
      required: ["path", "title", "blocks"],
    },
  },
  {
    name: "doc.create_xlsx",
    description: "Gera uma planilha XLSX a partir de uma ou mais sheets.",
    risk: "safe",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string" },
        sheets: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              rows: { type: "array", items: { type: "array", items: { type: "string" } } },
            },
            required: ["name", "rows"],
          },
        },
      },
      required: ["path", "sheets"],
    },
  },
  {
    name: "app.open",
    description: "Abre um arquivo no app padrão, um app do sistema ou uma URL.",
    risk: "confirm",
    parameters: {
      type: "object",
      properties: { target: { type: "string" }, app: { type: "string" } },
      required: ["target"],
    },
  },
  {
    name: "shell.execute",
    description: "Executa um comando do sistema dentro de um workspace. Passa por allowlist.",
    risk: "confirm",
    parameters: {
      type: "object",
      properties: {
        command: { type: "string" },
        cwd: { type: "string" },
        timeoutMs: { type: "integer", default: 30_000 },
      },
      required: ["command"],
    },
  },
  {
    name: "project.scaffold",
    description: "Cria a estrutura inicial de um projeto (react, node, python, blank).",
    risk: "confirm",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string" },
        template: { type: "string", enum: ["react", "node", "python", "blank"] },
      },
      required: ["path", "template"],
    },
  },
] as const;

export function getToolSpec(name: ToolName): ToolSpec {
  const found = TOOL_CATALOG.find((t) => t.name === name);
  if (!found) throw new Error(`tool desconhecida: ${name}`);
  return found;
}

export const ToolCallSchema = z.object({
  id: z.string(),
  name: ToolNameSchema,
  arguments: z.record(z.string(), z.unknown()),
});
export type ToolCall = z.infer<typeof ToolCallSchema>;

export const ApprovalSchema = z.object({
  id: z.string().uuid(),
  taskId: z.string().uuid(),
  tool: ToolNameSchema,
  arguments: z.record(z.string(), z.unknown()),
  risk: RiskLevelSchema,
  impactSummary: z.string(),
  status: z.enum(["pending", "approved", "denied", "expired", "auto"]),
  expiresAt: z.string(),
  resolvedAt: z.string().nullable(),
});
export type Approval = z.infer<typeof ApprovalSchema>;