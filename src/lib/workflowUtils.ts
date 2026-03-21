/**
 * Workflow Utilities
 * Handles status transitions, validation, and permissions
 */

import {
  VariableDataStatus,
  DirectPrintStatus,
  VARIABLE_DATA_STATUS_SEQUENCE,
  DIRECT_PRINT_STATUS_SEQUENCE,
  WorkflowType,
  PAYMENT_PHASES,
} from "./workflowConstants";

// ============================================
// TYPE DEFINITIONS
// ============================================

export interface StatusHistory {
  previousStatus: string;
  newStatus: string;
  timestamp: Date;
  changedBy: string;
  reason?: string;
  metadata?: Record<string, any>;
}

export interface WorkflowData {
  workflowType: WorkflowType;
  currentStatus: string;
  statusHistory: StatusHistory[];
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  metadata?: {
    advancePaymentReceived?: boolean;
    advancePaymentDate?: Date;
    remainingPaymentReceived?: boolean;
    remainingPaymentDate?: Date;
    proofApprovedDate?: Date;
    totalAmount?: number;
    advanceAmount?: number;
    remainingAmount?: number;
  };
}

// ============================================
// STATUS TRANSITION VALIDATION
// ============================================

export function canTransitionStatus(
  currentStatus: string,
  newStatus: string,
  workflowType: WorkflowType
): {
  allowed: boolean;
  reason?: string;
} {
  const sequence =
    workflowType === WorkflowType.VARIABLE_DATA
      ? (VARIABLE_DATA_STATUS_SEQUENCE as string[])
      : (DIRECT_PRINT_STATUS_SEQUENCE as string[]);

  const currentIndex = sequence.indexOf(currentStatus);
  const newIndex = sequence.indexOf(newStatus);

  if (currentIndex === -1) {
    return { allowed: false, reason: "Current status not found in workflow" };
  }

  if (newIndex === -1) {
    return { allowed: false, reason: "New status not found in workflow" };
  }

  // Can only move forward in the sequence
  if (newIndex <= currentIndex) {
    return {
      allowed: false,
      reason: "Can only move forward in the workflow",
    };
  }

  // Can only move one or more steps forward (allow skipping some steps)
  if (newIndex > currentIndex) {
    return { allowed: true };
  }

  return { allowed: false, reason: "Invalid status transition" };
}

// ============================================
// STEP-SPECIFIC VALIDATIONS
// ============================================

export function validateStepCompletion(
  status: string,
  workflowData: WorkflowData
): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  const meta = workflowData.metadata as Record<string, any>;

  switch (status) {
    case VariableDataStatus.PRODUCT_SELECTION:
      if (!meta?.productId) {
        errors.push("Product must be selected");
      }
      break;

    case VariableDataStatus.VARIABLE_DATA_FIELD_SELECTION:
      if (!meta?.selectedFields?.length) {
        errors.push("At least one field must be selected");
      }
      break;

    case VariableDataStatus.TEMPLATE_SELECTION:
      if (!meta?.templateId) {
        errors.push("Template must be selected");
      }
      break;

    case VariableDataStatus.DATA_UPLOADING:
      if (!meta?.uploadedFile) {
        errors.push("Data file must be uploaded");
      }
      break;

    case VariableDataStatus.DATA_PROCESSING:
      if (!meta?.processedRecords) {
        errors.push("Data must be processed successfully");
      }
      break;

    case VariableDataStatus.PROOF_CONFIRMED:
      if (!workflowData.metadata?.proofApprovedDate) {
        errors.push("Proof must be confirmed by customer");
      }
      if (!workflowData.metadata?.advancePaymentReceived) {
        errors.push(
          "50% advance payment must be received before proceeding"
        );
      }
      break;

    case VariableDataStatus.PRINTING_STARTED:
      if (!workflowData.metadata?.advancePaymentReceived) {
        errors.push("Advance payment must be received before printing");
      }
      break;

    case VariableDataStatus.AWAITING_REMAINING_PAYMENT:
      // Remaining payment should be tracked
      break;

    case DirectPrintStatus.PAYMENT_RECEIVED:
      if (!workflowData.metadata?.advancePaymentReceived) {
        errors.push("Payment must be received before proceeding");
      }
      break;
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ============================================
// PERMISSION CHECKING
// ============================================

export function canUpdateWorkflowStatus(
  userRole: string | null,
  targetStatus?: string
): {
  allowed: boolean;
  reason?: string;
} {
  const adminRoles = ["super_admin", "master_vendor", "accounts_manager"];
  const isAdmin = adminRoles.includes(userRole || "");

  if (!isAdmin) {
    return {
      allowed: false,
      reason: "Only Admin/Super Admin can update workflow status",
    };
  }

  return { allowed: true };
}

export function canViewWorkflow(
  userRole: string | null,
  projectOwnerId: string,
  currentUserId: string
): {
  allowed: boolean;
  reason?: string;
} {
  const adminRoles = ["super_admin", "master_vendor", "accounts_manager"];
  const isAdmin = adminRoles.includes(userRole || "");

  // Admin can view all workflows
  if (isAdmin) {
    return { allowed: true };
  }

  // Users can only view their own workflows
  if (currentUserId === projectOwnerId) {
    return { allowed: true };
  }

  return {
    allowed: false,
    reason: "You don't have permission to view this workflow",
  };
}

// ============================================
// PAYMENT VALIDATION
// ============================================

export function isPaymentRequired(status: string): boolean {
  const paymentRequiredStatuses = [
    VariableDataStatus.PROOF_CONFIRMED,
    VariableDataStatus.AWAITING_REMAINING_PAYMENT,
    DirectPrintStatus.PAYMENT_RECEIVED,
  ];

  return paymentRequiredStatuses.includes(status as any);
}

export function getPaymentPhase(
  status: string
): { phase: string; percentage: number; description: string } | null {
  if (
    status === VariableDataStatus.PROOF_CONFIRMED ||
    status === DirectPrintStatus.PAYMENT_RECEIVED
  ) {
    return {
      phase: "advance",
      percentage: PAYMENT_PHASES.ADVANCE_PAYMENT.percentage,
      description: PAYMENT_PHASES.ADVANCE_PAYMENT.description,
    };
  }

  if (status === VariableDataStatus.AWAITING_REMAINING_PAYMENT) {
    return {
      phase: "remaining",
      percentage: PAYMENT_PHASES.REMAINING_PAYMENT.percentage,
      description: PAYMENT_PHASES.REMAINING_PAYMENT.description,
    };
  }

  return null;
}

export function canProceedToPrinting(
  workflowData: WorkflowData
): {
  allowed: boolean;
  reason?: string;
} {
  if (
    workflowData.currentStatus !== VariableDataStatus.PROOF_CONFIRMED &&
    workflowData.currentStatus !== DirectPrintStatus.PAYMENT_RECEIVED
  ) {
    return {
      allowed: false,
      reason: "Proof must be confirmed and initial payment received",
    };
  }

  if (!workflowData.metadata?.advancePaymentReceived) {
    return {
      allowed: false,
      reason: "50% advance payment must be received",
    };
  }

  return { allowed: true };
}

// ============================================
// STATUS HISTORY MANAGEMENT
// ============================================

export function addToStatusHistory(
  workflowData: WorkflowData,
  newStatus: string,
  userId: string,
  reason?: string,
  metadata?: Record<string, any>
): WorkflowData {
  const historyEntry: StatusHistory = {
    previousStatus: workflowData.currentStatus,
    newStatus,
    timestamp: new Date(),
    changedBy: userId,
    reason,
    metadata,
  };

  return {
    ...workflowData,
    currentStatus: newStatus,
    statusHistory: [...workflowData.statusHistory, historyEntry],
    updatedAt: new Date(),
  };
}

export function getStatusHistory(workflowData: WorkflowData): StatusHistory[] {
  return [...workflowData.statusHistory].sort(
    (a, b) => b.timestamp.getTime() - a.timestamp.getTime()
  );
}

// ============================================
// WORKFLOW PROGRESS CALCULATION
// ============================================

export function getWorkflowProgress(
  currentStatus: string,
  workflowType: WorkflowType
): number {
  const sequence =
    workflowType === WorkflowType.VARIABLE_DATA
      ? (VARIABLE_DATA_STATUS_SEQUENCE as string[])
      : (DIRECT_PRINT_STATUS_SEQUENCE as string[]);

  const currentIndex = sequence.indexOf(currentStatus);
  if (currentIndex === -1) return 0;

  return Math.round(((currentIndex + 1) / sequence.length) * 100);
}

export function getCompletedSteps(
  currentStatus: string,
  workflowType: WorkflowType
): number {
  const sequence =
    workflowType === WorkflowType.VARIABLE_DATA
      ? (VARIABLE_DATA_STATUS_SEQUENCE as string[])
      : (DIRECT_PRINT_STATUS_SEQUENCE as string[]);

  const currentIndex = sequence.indexOf(currentStatus);
  return currentIndex + 1;
}

export function getTotalSteps(workflowType: WorkflowType): number {
  const sequence =
    workflowType === WorkflowType.VARIABLE_DATA
      ? (VARIABLE_DATA_STATUS_SEQUENCE as string[])
      : (DIRECT_PRINT_STATUS_SEQUENCE as string[]);

  return sequence.length;
}

// ============================================
// WORKFLOW COMPLETION
// ============================================

export function isWorkflowComplete(
  currentStatus: string,
  workflowType: WorkflowType
): boolean {
  const sequence =
    workflowType === WorkflowType.VARIABLE_DATA
      ? VARIABLE_DATA_STATUS_SEQUENCE
      : DIRECT_PRINT_STATUS_SEQUENCE;

  return currentStatus === sequence[sequence.length - 1];
}

export function getNextPendingSteps(
  currentStatus: string,
  workflowType: WorkflowType
): string[] {
  const sequence =
    workflowType === WorkflowType.VARIABLE_DATA
      ? (VARIABLE_DATA_STATUS_SEQUENCE as string[])
      : (DIRECT_PRINT_STATUS_SEQUENCE as string[]);

  const currentIndex = sequence.indexOf(currentStatus);
  if (currentIndex === -1) return [];

  return sequence.slice(currentIndex + 1);
}

// ============================================
// STATUS BATCH UPDATES
// ============================================

export function getStepsForPhase(
  phase: string,
  workflowType: WorkflowType
): string[] {
  const steps =
    workflowType === WorkflowType.VARIABLE_DATA
      ? require("./workflowConstants").VARIABLE_DATA_STEPS
      : require("./workflowConstants").DIRECT_PRINT_STEPS;

  return steps[phase] || [];
}

export function getPhaseForStatus(
  status: string,
  workflowType: WorkflowType
): string | null {
  const steps =
    workflowType === WorkflowType.VARIABLE_DATA
      ? require("./workflowConstants").VARIABLE_DATA_STEPS
      : require("./workflowConstants").DIRECT_PRINT_STEPS;

  for (const [phase, statuses] of Object.entries(steps)) {
    if ((statuses as string[]).includes(status)) {
      return phase;
    }
  }

  return null;
}
