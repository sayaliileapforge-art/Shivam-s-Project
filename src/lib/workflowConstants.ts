/**
 * Workflow Constants and Enums
 * Defines all workflow types, statuses, and transitions
 */

// ============================================
// VARIABLE DATA PRINTING WORKFLOW
// ============================================

export enum VariableDataStatus {
  PROJECT_CREATED = "vd_project_created",
  PRODUCT_SELECTION = "vd_product_selection",
  VARIABLE_DATA_FIELD_SELECTION = "vd_variable_data_field_selection",
  TEMPLATE_SELECTION = "vd_template_selection",
  DATA_UPLOADING = "vd_data_uploading",
  DATA_PROCESSING = "vd_data_processing",
  PROOF_CONFIRMED = "vd_proof_confirmed",
  PROCEEDING_TO_PRINTING = "vd_proceeding_to_printing",
  PRINTING_STARTED = "vd_printing_started",
  AWAITING_REMAINING_PAYMENT = "vd_awaiting_remaining_payment",
  DISPATCHED = "vd_dispatched",
  MARKED_RECEIVED = "vd_marked_received",
  MARKED_DELIVERED = "vd_marked_delivered",
}

export const VARIABLE_DATA_STATUS_SEQUENCE = [
  VariableDataStatus.PROJECT_CREATED,
  VariableDataStatus.PRODUCT_SELECTION,
  VariableDataStatus.VARIABLE_DATA_FIELD_SELECTION,
  VariableDataStatus.TEMPLATE_SELECTION,
  VariableDataStatus.DATA_UPLOADING,
  VariableDataStatus.DATA_PROCESSING,
  VariableDataStatus.PROOF_CONFIRMED,
  VariableDataStatus.PROCEEDING_TO_PRINTING,
  VariableDataStatus.PRINTING_STARTED,
  VariableDataStatus.AWAITING_REMAINING_PAYMENT,
  VariableDataStatus.DISPATCHED,
  VariableDataStatus.MARKED_RECEIVED,
  VariableDataStatus.MARKED_DELIVERED,
];

// ============================================
// DIRECT PRINT ORDER WORKFLOW
// ============================================

export enum DirectPrintStatus {
  FILE_RECEIVED = "dp_file_received",
  PAYMENT_RECEIVED = "dp_payment_received",
  PRINTING = "dp_printing",
  AWAITING_REMAINING_PAYMENT = "dp_awaiting_remaining_payment",
  DISPATCHED = "dp_dispatched",
  MARKED_RECEIVED = "dp_marked_received",
  MARKED_DELIVERED = "dp_marked_delivered",
}

export const DIRECT_PRINT_STATUS_SEQUENCE = [
  DirectPrintStatus.FILE_RECEIVED,
  DirectPrintStatus.PAYMENT_RECEIVED,
  DirectPrintStatus.PRINTING,
  DirectPrintStatus.AWAITING_REMAINING_PAYMENT,
  DirectPrintStatus.DISPATCHED,
  DirectPrintStatus.MARKED_RECEIVED,
  DirectPrintStatus.MARKED_DELIVERED,
];

// ============================================
// STATUS LABELS & DESCRIPTIONS
// ============================================

export const STATUS_LABELS: Record<string, string> = {
  // Variable Data
  [VariableDataStatus.PROJECT_CREATED]: "Project Created",
  [VariableDataStatus.PRODUCT_SELECTION]: "Product Selection",
  [VariableDataStatus.VARIABLE_DATA_FIELD_SELECTION]: "Field Selection",
  [VariableDataStatus.TEMPLATE_SELECTION]: "Template Selection",
  [VariableDataStatus.DATA_UPLOADING]: "Data Upload",
  [VariableDataStatus.DATA_PROCESSING]: "Data Processing",
  [VariableDataStatus.PROOF_CONFIRMED]: "Proof Confirmed",
  [VariableDataStatus.PROCEEDING_TO_PRINTING]: "Proceeding to Printing",
  [VariableDataStatus.PRINTING_STARTED]: "Printing in Progress",
  [VariableDataStatus.AWAITING_REMAINING_PAYMENT]: "Awaiting Payment",
  [VariableDataStatus.DISPATCHED]: "Dispatched",
  [VariableDataStatus.MARKED_RECEIVED]: "Received",
  [VariableDataStatus.MARKED_DELIVERED]: "Delivered",

  // Direct Print
  [DirectPrintStatus.FILE_RECEIVED]: "File Received",
  [DirectPrintStatus.PAYMENT_RECEIVED]: "Payment Received",
  [DirectPrintStatus.PRINTING]: "Printing",
  [DirectPrintStatus.AWAITING_REMAINING_PAYMENT]: "Awaiting Payment",
  [DirectPrintStatus.DISPATCHED]: "Dispatched",
  [DirectPrintStatus.MARKED_RECEIVED]: "Received",
  [DirectPrintStatus.MARKED_DELIVERED]: "Delivered",
};

export const STATUS_DESCRIPTIONS: Record<string, string> = {
  // Variable Data
  [VariableDataStatus.PROJECT_CREATED]: "Project has been created successfully",
  [VariableDataStatus.PRODUCT_SELECTION]: "Select the product for printing",
  [VariableDataStatus.VARIABLE_DATA_FIELD_SELECTION]:
    "Select which fields will vary across records",
  [VariableDataStatus.TEMPLATE_SELECTION]: "Choose or design the print template",
  [VariableDataStatus.DATA_UPLOADING]: "Upload data file (CSV, Excel, etc)",
  [VariableDataStatus.DATA_PROCESSING]: "Processing data and generating proof",
  [VariableDataStatus.PROOF_CONFIRMED]:
    "Proof has been confirmed - 50% advance payment required",
  [VariableDataStatus.PROCEEDING_TO_PRINTING]: "Ready to proceed to printing",
  [VariableDataStatus.PRINTING_STARTED]: "Printing has started",
  [VariableDataStatus.AWAITING_REMAINING_PAYMENT]: "Waiting for remaining 50% payment",
  [VariableDataStatus.DISPATCHED]: "Order has been dispatched",
  [VariableDataStatus.MARKED_RECEIVED]: "Received by customer",
  [VariableDataStatus.MARKED_DELIVERED]: "Delivered successfully",

  // Direct Print
  [DirectPrintStatus.FILE_RECEIVED]: "Print file has been received",
  [DirectPrintStatus.PAYMENT_RECEIVED]: "Payment has been received",
  [DirectPrintStatus.PRINTING]: "Order is being printed",
  [DirectPrintStatus.AWAITING_REMAINING_PAYMENT]: "Waiting for remaining payment",
  [DirectPrintStatus.DISPATCHED]: "Order has been dispatched",
  [DirectPrintStatus.MARKED_RECEIVED]: "Received by customer",
  [DirectPrintStatus.MARKED_DELIVERED]: "Delivered successfully",
};

// ============================================
// STATUS COLORS & BADGES
// ============================================

export const STATUS_COLOR: Record<string, string> = {
  // Variable Data - Planning Phase (Blue)
  [VariableDataStatus.PROJECT_CREATED]: "bg-blue-100 text-blue-800",
  [VariableDataStatus.PRODUCT_SELECTION]: "bg-blue-100 text-blue-800",
  [VariableDataStatus.VARIABLE_DATA_FIELD_SELECTION]: "bg-blue-100 text-blue-800",
  [VariableDataStatus.TEMPLATE_SELECTION]: "bg-blue-100 text-blue-800",

  // Variable Data - Processing Phase (Yellow)
  [VariableDataStatus.DATA_UPLOADING]: "bg-yellow-100 text-yellow-800",
  [VariableDataStatus.DATA_PROCESSING]: "bg-yellow-100 text-yellow-800",
  [VariableDataStatus.PROOF_CONFIRMED]: "bg-yellow-100 text-yellow-800",

  // Variable Data - Printing Phase (Orange)
  [VariableDataStatus.PROCEEDING_TO_PRINTING]: "bg-orange-100 text-orange-800",
  [VariableDataStatus.PRINTING_STARTED]: "bg-orange-100 text-orange-800",
  [VariableDataStatus.AWAITING_REMAINING_PAYMENT]: "bg-red-100 text-red-800",

  // Variable Data - Fulfillment Phase (Green)
  [VariableDataStatus.DISPATCHED]: "bg-green-100 text-green-800",
  [VariableDataStatus.MARKED_RECEIVED]: "bg-green-100 text-green-800",
  [VariableDataStatus.MARKED_DELIVERED]: "bg-green-100 text-green-800",

  // Direct Print - Same color scheme
  [DirectPrintStatus.FILE_RECEIVED]: "bg-blue-100 text-blue-800",
  [DirectPrintStatus.PAYMENT_RECEIVED]: "bg-yellow-100 text-yellow-800",
  [DirectPrintStatus.PRINTING]: "bg-orange-100 text-orange-800",
  [DirectPrintStatus.AWAITING_REMAINING_PAYMENT]: "bg-red-100 text-red-800",
  [DirectPrintStatus.DISPATCHED]: "bg-green-100 text-green-800",
  [DirectPrintStatus.MARKED_RECEIVED]: "bg-green-100 text-green-800",
  [DirectPrintStatus.MARKED_DELIVERED]: "bg-green-100 text-green-800",
};

// ============================================
// WORKFLOW TYPE
// ============================================

export enum WorkflowType {
  VARIABLE_DATA = "variable_data",
  DIRECT_PRINT = "direct_print",
}

// ============================================
// PAYMENT PHASES
// ============================================

export const PAYMENT_PHASES = {
  ADVANCE_PAYMENT: {
    percentage: 50,
    status: VariableDataStatus.PROOF_CONFIRMED,
    description: "50% advance payment required before printing",
  },
  REMAINING_PAYMENT: {
    percentage: 50,
    status: VariableDataStatus.AWAITING_REMAINING_PAYMENT,
    description: "Remaining 50% payment due",
  },
};

// ============================================
// FILE UPLOAD ALLOWED FORMATS
// ============================================

export const ALLOWED_DATA_FORMATS = [
  ".csv",
  ".xlsx",
  ".xls",
  ".json",
  ".txt",
];

export const ALLOWED_DIRECT_PRINT_FORMATS = [
  ".pdf",
  ".jpg",
  ".jpeg",
  ".png",
  ".tiff",
];

// ============================================
// STEP CATEGORIES
// ============================================

export const VARIABLE_DATA_STEPS = {
  PLANNING: [
    VariableDataStatus.PROJECT_CREATED,
    VariableDataStatus.PRODUCT_SELECTION,
    VariableDataStatus.VARIABLE_DATA_FIELD_SELECTION,
    VariableDataStatus.TEMPLATE_SELECTION,
  ],
  PROCESSING: [
    VariableDataStatus.DATA_UPLOADING,
    VariableDataStatus.DATA_PROCESSING,
    VariableDataStatus.PROOF_CONFIRMED,
  ],
  PRINTING: [
    VariableDataStatus.PROCEEDING_TO_PRINTING,
    VariableDataStatus.PRINTING_STARTED,
    VariableDataStatus.AWAITING_REMAINING_PAYMENT,
  ],
  FULFILLMENT: [
    VariableDataStatus.DISPATCHED,
    VariableDataStatus.MARKED_RECEIVED,
    VariableDataStatus.MARKED_DELIVERED,
  ],
};

export const DIRECT_PRINT_STEPS = {
  SETUP: [DirectPrintStatus.FILE_RECEIVED, DirectPrintStatus.PAYMENT_RECEIVED],
  PRINTING: [DirectPrintStatus.PRINTING],
  FULFILLMENT: [
    DirectPrintStatus.AWAITING_REMAINING_PAYMENT,
    DirectPrintStatus.DISPATCHED,
    DirectPrintStatus.MARKED_RECEIVED,
    DirectPrintStatus.MARKED_DELIVERED,
  ],
};
