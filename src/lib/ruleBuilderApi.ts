/**
 * ruleBuilderApi.ts
 * Frontend API service for PrintRule CRUD.
 */

import { API_BASE } from './apiService';

const RULES_BASE = `${API_BASE}/rules`;

// ─── Types ────────────────────────────────────────────────────────────────────

export type ConditionOperator =
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'not_contains'
  | 'starts_with'
  | 'ends_with'
  | 'is_empty'
  | 'is_not_empty';

export const CONDITION_OPERATOR_LABELS: Record<ConditionOperator, string> = {
  equals: 'Equals',
  not_equals: 'Not equals',
  contains: 'Contains',
  not_contains: 'Does not contain',
  starts_with: 'Starts with',
  ends_with: 'Ends with',
  is_empty: 'Is empty',
  is_not_empty: 'Is not empty',
};

export interface Condition {
  id: string;
  field: string;
  operator: ConditionOperator;
  value: string;
}

export interface ConditionGroup {
  id: string;
  /** How conditions within this group are joined */
  operator: 'AND' | 'OR';
  conditions: Condition[];
}

export interface FieldMapping {
  templateField: string;
  csvColumn: string;
  fieldType: 'text' | 'image' | 'barcode';
}

export interface PrintRule {
  _id: string;
  projectId: string;
  templateId: string;
  templateName: string;
  csvFileName: string;
  groupOperator: 'AND' | 'OR';
  conditionGroups: ConditionGroup[];
  fieldMappings: FieldMapping[];
  priority: number;
  isDefault: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export type PrintRuleInput = Omit<PrintRule, '_id' | 'createdAt' | 'updatedAt' | 'isActive'> & {
  isActive?: boolean;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function handleResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  let json: { success?: boolean; data?: T; error?: string } = {};
  if (text) {
    try { json = JSON.parse(text); } catch { throw new Error(text); }
  }
  if (!response.ok || json.success === false) {
    throw new Error(json.error || `Request failed: ${response.status}`);
  }
  return json.data as T;
}

// ─── API functions ────────────────────────────────────────────────────────────

export async function getRulesByProject(projectId: string): Promise<PrintRule[]> {
  const res = await fetch(`${RULES_BASE}?projectId=${encodeURIComponent(projectId)}`, {
    cache: 'no-store',
  });
  return handleResponse<PrintRule[]>(res);
}

export async function getRuleById(ruleId: string): Promise<PrintRule> {
  const res = await fetch(`${RULES_BASE}/${ruleId}`, { cache: 'no-store' });
  return handleResponse<PrintRule>(res);
}

export async function createRule(input: PrintRuleInput): Promise<PrintRule> {
  const res = await fetch(RULES_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return handleResponse<PrintRule>(res);
}

export async function updateRule(
  ruleId: string,
  input: Partial<PrintRuleInput>
): Promise<PrintRule> {
  const res = await fetch(`${RULES_BASE}/${ruleId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return handleResponse<PrintRule>(res);
}

export async function deleteRule(ruleId: string): Promise<void> {
  const res = await fetch(`${RULES_BASE}/${ruleId}`, { method: 'DELETE' });
  await handleResponse<void>(res);
}

// ─── Project Rule Session ─────────────────────────────────────────────────────

export interface CsvFieldMeta {
  key: string;
  label: string;
  type: 'text' | 'image' | 'barcode';
}

export interface ProjectRuleSession {
  rules: PrintRule[];
  csvRows: Record<string, string>[];
  csvMeta: {
    fileName: string;
    totalRecords: number;
    lastUpdated: string;
    fields: CsvFieldMeta[];
  } | null;
}

export async function getProjectRuleSession(projectId: string): Promise<ProjectRuleSession> {
  const res = await fetch(`${RULES_BASE}/session/${encodeURIComponent(projectId)}`, {
    cache: 'no-store',
  });
  return handleResponse<ProjectRuleSession>(res);
}

// ─── Condition evaluation (runs in the browser against CSV rows) ──────────────

export function evaluateCondition(condition: Condition, row: Record<string, string>): boolean {
  const rawCellValue = String(row[condition.field] ?? '').trim();
  const conditionValue = condition.value.trim();

  switch (condition.operator) {
    case 'equals':
      return rawCellValue.toLowerCase() === conditionValue.toLowerCase();
    case 'not_equals':
      return rawCellValue.toLowerCase() !== conditionValue.toLowerCase();
    case 'contains':
      return rawCellValue.toLowerCase().includes(conditionValue.toLowerCase());
    case 'not_contains':
      return !rawCellValue.toLowerCase().includes(conditionValue.toLowerCase());
    case 'starts_with':
      return rawCellValue.toLowerCase().startsWith(conditionValue.toLowerCase());
    case 'ends_with':
      return rawCellValue.toLowerCase().endsWith(conditionValue.toLowerCase());
    case 'is_empty':
      return rawCellValue === '';
    case 'is_not_empty':
      return rawCellValue !== '';
    default:
      return true;
  }
}

export function evaluateConditionGroup(
  group: ConditionGroup,
  row: Record<string, string>
): boolean {
  if (group.conditions.length === 0) return true;
  if (group.operator === 'AND') {
    return group.conditions.every((c) => evaluateCondition(c, row));
  }
  return group.conditions.some((c) => evaluateCondition(c, row));
}

export function evaluateRule(
  rule: Pick<PrintRule, 'conditionGroups' | 'groupOperator'>,
  row: Record<string, string>
): boolean {
  const { conditionGroups, groupOperator } = rule;
  if (!conditionGroups.length) return true;
  if (groupOperator === 'AND') {
    return conditionGroups.every((g) => evaluateConditionGroup(g, row));
  }
  return conditionGroups.some((g) => evaluateConditionGroup(g, row));
}

export function filterRowsByRule(
  rule: Pick<PrintRule, 'conditionGroups' | 'groupOperator'>,
  rows: Record<string, string>[]
): Record<string, string>[] {
  if (!rule.conditionGroups.length) return rows;
  return rows.filter((row) => evaluateRule(rule, row));
}

// ─── Auto-mapping helper ──────────────────────────────────────────────────────

const IMAGE_KEYS = /photo|image|img|picture|pic|avatar|logo|icon/i;
const BARCODE_KEYS = /barcode|qr|qrcode/i;

export function inferFieldType(key: string): FieldMapping['fieldType'] {
  if (BARCODE_KEYS.test(key)) return 'barcode';
  if (IMAGE_KEYS.test(key)) return 'image';
  return 'text';
}

/**
 * Try to match a template field name (e.g. "Student Name") to a CSV column.
 * Uses normalised string comparison (lower-case, strip non-alphanumeric).
 */
function normalize(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function autoMapFields(
  templateFields: string[],
  csvColumns: string[]
): FieldMapping[] {
  return templateFields.map((field) => {
    const normField = normalize(field);
    const matched = csvColumns.find((col) => normalize(col) === normField)
      ?? csvColumns.find((col) => normalize(col).includes(normField) || normField.includes(normalize(col)))
      ?? '';
    return {
      templateField: field,
      csvColumn: matched,
      fieldType: inferFieldType(matched || field),
    };
  });
}

/**
 * Extract variable field keys from a template's canvasJSON.
 * Returns unique field keys referenced by text placeholder `{key}` or variableKey attrs.
 */
export function extractTemplateFields(canvasJSON: string | undefined): string[] {
  if (!canvasJSON) return [];
  const fields = new Set<string>();

  try {
    const parsed = JSON.parse(canvasJSON) as Record<string, unknown>;
    const collectObjects = (objs: unknown[]) => {
      if (!Array.isArray(objs)) return;
      for (const obj of objs) {
        if (!obj || typeof obj !== 'object') continue;
        const o = obj as Record<string, unknown>;

        // Variable key attrs
        const vKey = o.variableKey ?? o.__fieldKey ?? o.fieldKey ?? o.dataKey;
        if (typeof vKey === 'string' && vKey.trim()) fields.add(vKey.trim());

        // Text placeholders {field}
        if (typeof o.text === 'string') {
          const re = /\{([^{}]+)\}/g;
          let m: RegExpExecArray | null;
          while ((m = re.exec(o.text)) !== null) {
            fields.add(m[1].trim());
          }
        }
      }
    };

    const canvas = parsed.canvas as { objects?: unknown[] } | undefined;
    if (canvas?.objects) collectObjects(canvas.objects);

    const pages = parsed.pages as Array<{ canvas?: { objects?: unknown[] } }> | undefined;
    if (Array.isArray(pages)) {
      pages.forEach((p) => {
        if (p?.canvas?.objects) collectObjects(p.canvas.objects);
      });
    }
  } catch {
    // Ignore parse errors
  }

  return Array.from(fields);
}

/** Apply field mappings to a CSV row, returning a substituted record. */
export function applyMappings(
  row: Record<string, string>,
  mappings: FieldMapping[]
): Record<string, string> {
  const result: Record<string, string> = { ...row };
  for (const m of mappings) {
    if (m.csvColumn && m.templateField && m.csvColumn !== m.templateField) {
      result[m.templateField] = row[m.csvColumn] ?? '';
    }
  }
  return result;
}
