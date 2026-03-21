import React from "react";
import { Check, Clock, ChevronRight } from "lucide-react";
import {
  STATUS_LABELS,
  STATUS_COLOR,
  VARIABLE_DATA_STATUS_SEQUENCE,
  DIRECT_PRINT_STATUS_SEQUENCE,
  WorkflowType,
  VariableDataStatus,
  DirectPrintStatus,
} from "../../../lib/workflowConstants";

interface WorkflowStepperProps {
  currentStatus: string;
  workflowType: WorkflowType;
  onStepClick?: (status: string) => void;
  highlightedSteps?: string[];
}

export const WorkflowStepper = ({
  currentStatus,
  workflowType,
  onStepClick,
  highlightedSteps = [],
}: WorkflowStepperProps) => {
  const sequence =
    workflowType === WorkflowType.VARIABLE_DATA
      ? (VARIABLE_DATA_STATUS_SEQUENCE as string[])
      : (DIRECT_PRINT_STATUS_SEQUENCE as string[]);

  const currentIndex = sequence.indexOf(currentStatus);

  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-4">
      {sequence.map((status, index) => {
        const isCompleted = index < currentIndex;
        const isCurrent = index === currentIndex;
        const isPending = index > currentIndex;
        const isHighlighted = highlightedSteps.includes(status as any);

        const color = STATUS_COLOR[status];
        const label = STATUS_LABELS[status];

        return (
          <React.Fragment key={status}>
            <div className="flex flex-col items-center">
              <button
                onClick={() => onStepClick?.(status as any)}
                disabled={isPending && !onStepClick}
                className={`
                  relative flex items-center justify-center w-10 h-10 rounded-full
                  border-2 font-semibold text-sm transition-all
                  ${
                    isCompleted
                      ? "bg-green-500 border-green-600 text-white"
                      : isCurrent
                        ? `bg-primary border-primary text-white ring-2 ring-primary/30`
                        : isHighlighted
                          ? `${color} border-current`
                          : "bg-gray-100 border-gray-300 text-gray-600"
                  }
                  ${onStepClick && !isPending ? "cursor-pointer hover:shadow-md" : ""}
                `}
              >
                {isCompleted ? (
                  <Check className="w-5 h-5" />
                ) : isCurrent ? (
                  <Clock className="w-5 h-5 animate-pulse" />
                ) : (
                  <span>{index + 1}</span>
                )}
              </button>
              <label className="text-xs text-center font-medium mt-2 max-w-[80px] leading-tight">
                {label}
              </label>
            </div>

            {index < sequence.length - 1 && (
              <div
                className={`flex-1 h-1 mx-1 rounded ${
                  isCompleted ? "bg-green-500" : "bg-gray-200"
                }`}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};

export default WorkflowStepper;
