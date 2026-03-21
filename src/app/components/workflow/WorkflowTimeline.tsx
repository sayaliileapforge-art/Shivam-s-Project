import React from "react";
import { Calendar, User, MessageSquare } from "lucide-react";
import { Card } from "../ui/card";
import { StatusHistory } from "../../../lib/workflowUtils";
import { STATUS_LABELS } from "../../../lib/workflowConstants";

interface WorkflowTimelineProps {
  history: StatusHistory[];
  compact?: boolean;
}

export const WorkflowTimeline = ({
  history,
  compact = false,
}: WorkflowTimelineProps) => {
  // Show most recent first
  const sorted = [...history].sort(
    (a, b) => b.timestamp.getTime() - a.timestamp.getTime()
  );

  if (sorted.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <p>No status changes yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {sorted.map((entry, index) => (
        <div key={index} className="flex gap-4">
          {/* Timeline line and dot */}
          <div className="flex flex-col items-center">
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-white font-semibold text-sm">
              {index + 1}
            </div>
            {index < sorted.length - 1 && (
              <div className="w-1 h-12 bg-primary/20 mt-2" />
            )}
          </div>

          {/* Content */}
          <div className="flex-1 pb-4">
            <Card className={compact ? "p-2" : "p-4"}>
              <div
                className={compact ? "space-y-1" : "space-y-2"}
              >
                {/* Status */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-sm">
                      {entry.newStatus === entry.previousStatus
                        ? "Status Initiated"
                        : "Status Changed"}
                    </p>
                    <p className="text-sm text-foreground">
                      <span className="font-medium">
                        {STATUS_LABELS[entry.newStatus] || entry.newStatus}
                      </span>
                      {entry.previousStatus && (
                        <>
                          {" "}
                          <span className="text-muted-foreground">
                            (from{" "}
                            {STATUS_LABELS[entry.previousStatus] ||
                              entry.previousStatus}
                            )
                          </span>
                        </>
                      )}
                    </p>
                  </div>
                </div>

                {/* Timestamp and User */}
                <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                  <div className="flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>
                      {new Date(entry.timestamp).toLocaleDateString(
                        undefined,
                        {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        }
                      )}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <User className="w-3.5 h-3.5" />
                    <span>{entry.changedBy}</span>
                  </div>
                </div>

                {/* Reason */}
                {entry.reason && (
                  <div className="flex items-start gap-2 text-xs bg-muted/50 p-2 rounded">
                    <MessageSquare className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                    <span className="text-muted-foreground">{entry.reason}</span>
                  </div>
                )}

                {/* Metadata */}
                {entry.metadata && Object.keys(entry.metadata).length > 0 && (
                  <div className="text-xs bg-muted/30 p-2 rounded space-y-1">
                    <p className="font-semibold text-xs">Additional Info:</p>
                    {Object.entries(entry.metadata).map(([key, value]) => (
                      <p key={key} className="text-muted-foreground">
                        <span className="font-medium">{key}:</span>{" "}
                        {typeof value === "object"
                          ? JSON.stringify(value)
                          : String(value)}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            </Card>
          </div>
        </div>
      ))}
    </div>
  );
};

export default WorkflowTimeline;
