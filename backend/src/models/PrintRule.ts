import mongoose, { Schema, Document } from 'mongoose';

// ─── Sub-schemas ──────────────────────────────────────────────────────────────

export interface ICondition {
  id: string;
  field: string;
  operator:
    | 'equals'
    | 'not_equals'
    | 'contains'
    | 'not_contains'
    | 'starts_with'
    | 'ends_with'
    | 'is_empty'
    | 'is_not_empty';
  value: string;
}

export interface IConditionGroup {
  id: string;
  /** How conditions within this group are joined */
  operator: 'AND' | 'OR';
  conditions: ICondition[];
}

export interface IFieldMapping {
  templateField: string;
  csvColumn: string;
  fieldType: 'text' | 'image' | 'barcode';
}

// ─── Main document ────────────────────────────────────────────────────────────

export interface IPrintRule extends Document {
  projectId: mongoose.Types.ObjectId;
  templateId: mongoose.Types.ObjectId;
  templateName: string;
  csvFileName: string;
  /** How condition groups are joined (AND / OR) */
  groupOperator: 'AND' | 'OR';
  conditionGroups: IConditionGroup[];
  fieldMappings: IFieldMapping[];
  priority: number;
  isDefault: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Mongoose schemas ─────────────────────────────────────────────────────────

const ConditionSchema = new Schema<ICondition>(
  {
    id: { type: String, required: true },
    field: { type: String, required: true },
    operator: {
      type: String,
      enum: [
        'equals', 'not_equals', 'contains', 'not_contains',
        'starts_with', 'ends_with', 'is_empty', 'is_not_empty',
      ],
      default: 'equals',
    },
    value: { type: String, default: '' },
  },
  { _id: false }
);

const ConditionGroupSchema = new Schema<IConditionGroup>(
  {
    id: { type: String, required: true },
    operator: { type: String, enum: ['AND', 'OR'], default: 'AND' },
    conditions: { type: [ConditionSchema], default: [] },
  },
  { _id: false }
);

const FieldMappingSchema = new Schema<IFieldMapping>(
  {
    templateField: { type: String, required: true },
    csvColumn: { type: String, default: '' },
    fieldType: {
      type: String,
      enum: ['text', 'image', 'barcode'],
      default: 'text',
    },
  },
  { _id: false }
);

const PrintRuleSchema = new Schema<IPrintRule>(
  {
    projectId: {
      type: Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
      index: true,
    },
    templateId: {
      type: Schema.Types.ObjectId,
      ref: 'ProductTemplate',
      required: true,
    },
    templateName: { type: String, required: true },
    csvFileName: { type: String, default: '' },
    groupOperator: { type: String, enum: ['AND', 'OR'], default: 'AND' },
    conditionGroups: { type: [ConditionGroupSchema], default: [] },
    fieldMappings: { type: [FieldMappingSchema], default: [] },
    priority: { type: Number, default: 1 },
    isDefault: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

// Enforce only one default rule per project
PrintRuleSchema.index(
  { projectId: 1, isDefault: 1 },
  { partialFilterExpression: { isDefault: true } }
);

export default mongoose.model<IPrintRule>('PrintRule', PrintRuleSchema);
