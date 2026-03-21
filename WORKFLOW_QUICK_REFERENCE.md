# Workflow System Quick Reference

## 📁 Files Created/Modified

### Core Library Files
| File | Purpose |
|------|---------|
| `src/lib/workflowConstants.ts` | Enums, status labels, colors, step categories |
| `src/lib/workflowUtils.ts` | Business logic, validation, permission checks |
| `src/lib/projectStore.ts` | Data layer - CRUD operations for workflows |

### UI Components
| File | Purpose |
|------|---------|
| `src/app/components/workflow/StatusBadge.tsx` | Color-coded status indicator |
| `src/app/components/workflow/WorkflowStepper.tsx` | Step-by-step progress visualization |
| `src/app/components/workflow/WorkflowTimeline.tsx` | Audit trail and status history |
| `src/app/components/workflow/StatusTransitionModal.tsx` | Status update dialog |

### Page Components
| File | Purpose |
|------|---------|
| `src/app/pages/VariableDataWorkflow.tsx` | Complex multi-step printing workflow |
| `src/app/pages/DirectPrintWorkflow.tsx` | Simplified PDF/image printing orders |

### Configuration
| File | Changes |
|------|---------|
| `src/app/routes.tsx` | Added `/workflows/variable-data` and `/workflows/direct-print` |

---

## 🚀 Quick Start

### Access Workflows
```
/workflows/variable-data  - Variable Data Printing (13 steps)
/workflows/direct-print   - Direct Print Orders (7 steps)
```

### Create Workflow Project
```typescript
import { createWorkflowProject, WorkflowType } from "src/lib/projectStore";

const project = createWorkflowProject({
  name: "My Project",
  clientId: "client_123",
  clientName: "Client Name",
  ownerId: "user_456",
  ownerName: "Your Name",
  workflowType: WorkflowType.VARIABLE_DATA,
  payment: {
    totalAmount: 10000,
    advanceAmount: 5000,
    remainingAmount: 5000,
  },
});
```

### Update Status
```typescript
import { updateWorkflowStatus } from "src/lib/projectStore";

updateWorkflowStatus(
  projectId,
  "vd_product_selection",  // next status
  userId,
  "User selected ID Card"  // reason
);
```

### Check Permissions
```typescript
import { canUpdateWorkflowStatus } from "src/lib/workflowUtils";

const canUpdate = canUpdateWorkflowStatus(user?.role);
// { allowed: true } or { allowed: false, reason: "..." }
```

---

## 📊 Variable Data Status Flow

```
1. vd_project_created
   ↓
2. vd_product_selection
   ↓
3. vd_variable_data_field_selection
   ↓
4. vd_template_selection
   ↓
5. vd_data_uploading
   ↓
6. vd_data_processing
   ↓
7. vd_proof_confirmed [REQUIRES 50% PAYMENT]
   ↓
8. vd_proceeding_to_printing
   ↓
9. vd_printing_started
   ↓
10. vd_awaiting_remaining_payment [REQUIRES 50% BALANCE]
    ↓
11. vd_dispatched
    ↓
12. vd_marked_received
    ↓
13. vd_marked_delivered [COMPLETE]
```

## 📊 Direct Print Status Flow

```
1. dp_file_received
   ↓
2. dp_payment_received
   ↓
3. dp_printing
   ↓
4. dp_awaiting_remaining_payment (optional)
   ↓
5. dp_dispatched
   ↓
6. dp_marked_received
   ↓
7. dp_marked_delivered [COMPLETE]
```

---

## 🔐 Permission Matrix

| Role | View Own | View All | Update Status |
|------|----------|----------|---------------|
| super_admin | ✅ | ✅ | ✅ |
| master_vendor | ✅ | ✅ | ✅ |
| accounts_manager | ✅ | ✅ | ✅ |
| Other Vendors | ✅ | ❌ | ❌ |
| Clients | ✅ | ❌ | ❌ |

---

## 💰 Payment Requirements

### Variable Data Printing
- **Stage**: After proof confirmation (vd_proof_confirmed)
- **Advance**: 50% required before printing starts
- **Remaining**: 50% due before delivery (vd_awaiting_remaining_payment)
- **Validation**: System prevents printing without advance payment

### Direct Print Orders
- **Payment**: Full or partial payment before printing
- **Remaining**: Optional second payment stage
- **Tracking**: Dates recorded for both phases

---

## 🎨 Status Colors

| Phase | Color | Statuses |
|-------|-------|----------|
| Planning | 🔵 Blue | project_created, product_selection, field_selection, template_selection |
| Processing | 🟡 Yellow | data_uploading, data_processing, proof_confirmed |
| Printing | 🟠 Orange | proceeding_to_printing, printing_started |
| Awaiting Payment | 🔴 Red | awaiting_remaining_payment |
| Fulfillment | 🟢 Green | dispatched, marked_received, marked_delivered |

---

## 🧪 Test Scenarios

### Scenario 1: Variable Data Success Path
1. Create project → vd_project_created
2. Select product → vd_product_selection
3. Select fields → vd_variable_data_field_selection
4. Choose template → vd_template_selection
5. Upload CSV → vd_data_uploading
6. Process data → vd_data_processing
7. Confirm proof + pay 50% → vd_proof_confirmed
8. Start printing → vd_printing_started
9. Await remaining payment → vd_awaiting_remaining_payment
10. Receive balance → dispatch → vd_dispatched
11. Mark received → vd_marked_received
12. Mark delivered → vd_marked_delivered ✓

### Scenario 2: Direct Print Quick Path
1. Upload PDF → dp_file_received
2. Full payment received → dp_payment_received
3. Printing begins → dp_printing
4. Dispatch → dp_dispatched
5. Receive → dp_marked_received
6. Delivered → dp_marked_delivered ✓

### Scenario 3: Permission Denied
1. Non-admin user tries to update status
2. System shows: "Only Admin/Super Admin can update workflow status"
3. Status update button disabled
4. User can view progress but not modify

---

## 📈 Summary Statistics

| Metric | Variable Data | Direct Print |
|--------|---------------|--------------|
| Total Steps | 13 | 7 |
| Planning Steps | 4 | 1 |
| Payment Stages | 2 (50%+50%) | 1-2 |
| Estimated Duration | 3-7 days | 1-3 days |
| Complexity | High (multi-step) | Low (simplified) |

---

## 🔍 Debugging Tips

### Check Workflow Status
```typescript
const project = getWorkflowProject(projectId);
console.log(project?.workflowData.currentStatus);
```

### View Full History
```typescript
const history = project?.workflowData.statusHistory;
history?.forEach(entry => {
  console.log(`${entry.timestamp}: ${entry.previousStatus} → ${entry.newStatus} (${entry.reason})`);
});
```

### Validate Next Steps
```typescript
import { canTransitionStatus } from "src/lib/workflowUtils";

const validation = canTransitionStatus(
  currentStatus,
  targetStatus,
  WorkflowType.VARIABLE_DATA
);
console.log(validation.reason); // If allowed: true
```

### Check Payment Status
```typescript
const isPaid = project?.workflowData.metadata?.advancePaymentReceived;
console.log(isPaid ? "Advance paid" : "Advance pending");
```

---

## 📝 Common Tasks

### Filter Projects by Status
```typescript
const projects = loadWorkflowProjects();
const inProgress = projects.filter(p => 
  !isWorkflowComplete(p.workflowData.currentStatus, WorkflowType.VARIABLE_DATA)
);
```

### Get User's Projects
```typescript
import { getWorkflowProjectsByOwner } from "src/lib/projectStore";

const userProjects = getWorkflowProjectsByOwner(userId);
```

### Calculate Progress
```typescript
import { getWorkflowProgress } from "src/lib/workflowUtils";

const percent = getWorkflowProgress(status, WorkflowType.VARIABLE_DATA);
console.log(`${percent}% complete`);
```

### Record Status Change
```typescript
import { addToStatusHistory } from "src/lib/workflowUtils";

const updated = addToStatusHistory(
  workflowData,
  newStatus,
  userId,
  "Payment received from customer",
  { paymentAmount: 5000 }
);
```

---

## ⚠️ Known Limitations

1. **localStorage Storage**: Data persists per browser (use backend for production)
2. **No Real-time**: Status changes require page refresh to propagate
3. **No Payment Processing**: Payment integration required
4. **No File Storage**: Files must be uploaded to backend
5. **No Notifications**: Email/SMS alerts not implemented
6. **No Scheduling**: Automated transitions not available

---

## 🚀 Production Deployment

Before deploying to production:

### Backend Required
- [ ] Implement JWT token validation
- [ ] Add database schema for workflows
- [ ] Create API endpoints for CRUD operations
- [ ] Add payment verification middleware
- [ ] Implement audit logging
- [ ] Add API rate limiting

### Security
- [ ] Verify user roles on API calls
- [ ] Validate all input data
- [ ] Implement CORS properly
- [ ] Add HTTPS enforcement
- [ ] Secure payment data

### Monitoring
- [ ] Set up error logging
- [ ] Monitor payment transactions
- [ ] Track workflow timings
- [ ] Alert on stuck workflows
- [ ] Monitor API performance

---

## 📞 Support

For questions or issues related to the workflow system:
1. Check WORKFLOW_SYSTEM_DOCUMENTATION.md for detailed info
2. Review the specific component file comments
3. Check workflow validation/permission error messages
4. Verify data types match interface definitions

**Build Status**: ✅ Complete (2789 modules, 16.91s build time)
