import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";
import { Alert, AlertDescription } from "../ui/alert";
import { Card } from "../ui/card";
import { Check, AlertCircle } from "lucide-react";
import {
  canTransitionStatus,
  validateStepCompletion,
  WorkflowData,
} from "../../../lib/workflowUtils";
import { STATUS_LABELS, STATUS_DESCRIPTIONS } from "../../../lib/workflowConstants";

interface StatusTransitionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (newStatus: string, reason?: string) => void;
  currentStatus: string;
  availableNextStatuses: string[];
  isLoading?: boolean;
  workflowData?: WorkflowData;
}

export const StatusTransitionModal = ({
  isOpen,
  onClose,
  onConfirm,
  currentStatus,
  availableNextStatuses,
  isLoading = false,
  workflowData,
}: StatusTransitionModalProps) => {
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<string[]>([]);

  const handleStatusSelect = (newStatus: string) => {
    setSelectedStatus(newStatus);
    setErrors([]);

    // Validate transition
    if (workflowData) {
      const validation = validateStepCompletion(newStatus, workflowData);
      if (!validation.valid) {
        setErrors(validation.errors);
      }
    }
  };

  const handleConfirm = () => {
    if (!selectedStatus) {
      setErrors(["Please select a status"]);
      return;
    }

    if (errors.length > 0) {
      return;
    }

    onConfirm(selectedStatus, reason || undefined);
    setSelectedStatus(null);
    setReason("");
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Update Workflow Status</DialogTitle>
          <DialogDescription>
            Select the next workflow status and add a reason for the change.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Current Status */}
          <div className="bg-muted/50 p-4 rounded-lg">
            <p className="text-sm text-muted-foreground mb-1">Current Status</p>
            <p className="font-semibold text-lg">
              {STATUS_LABELS[currentStatus] || currentStatus}
            </p>
          </div>

          {/* Available Next Statuses */}
          <div>
            <label className="text-sm font-semibold mb-3 block">
              Select Next Status
            </label>
            <div className="grid grid-cols-1 gap-2">
              {availableNextStatuses.length > 0 ? (
                availableNextStatuses.map((status) => (
                  <Card
                    key={status}
                    className={`p-4 cursor-pointer transition-all border-2 ${
                      selectedStatus === status
                        ? "border-primary bg-primary/5"
                        : "border-transparent hover:border-primary/30"
                    }`}
                    onClick={() => handleStatusSelect(status)}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`w-5 h-5 rounded-full border-2 mt-0.5 flex items-center justify-center flex-shrink-0 ${
                          selectedStatus === status
                            ? "border-primary bg-primary"
                            : "border-gray-300"
                        }`}
                      >
                        {selectedStatus === status && (
                          <Check className="w-3 h-3 text-white" />
                        )}
                      </div>
                      <div className="flex-1">
                        <p className="font-semibold text-sm">
                          {STATUS_LABELS[status] || status}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {STATUS_DESCRIPTIONS[status] || ""}
                        </p>
                      </div>
                    </div>
                  </Card>
                ))
              ) : (
                <div className="text-center py-6 text-muted-foreground">
                  <p>No workflow progression available from this status.</p>
                </div>
              )}
            </div>
          </div>

          {/* Validation Errors */}
          {errors.length > 0 && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <ul className="list-disc pl-5 space-y-1 mt-1">
                  {errors.map((error, idx) => (
                    <li key={idx}>{error}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {/* Reason */}
          {selectedStatus && (
            <div>
              <label htmlFor="reason" className="text-sm font-semibold mb-2 block">
                Reason (Optional)
              </label>
              <Textarea
                id="reason"
                placeholder="Describe the reason for this status change..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                className="resize-none"
              />
              <p className="text-xs text-muted-foreground mt-2">
                This will be recorded in the workflow audit log.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={
              !selectedStatus || errors.length > 0 || isLoading
            }
          >
            {isLoading ? "Updating..." : "Update Status"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default StatusTransitionModal;
