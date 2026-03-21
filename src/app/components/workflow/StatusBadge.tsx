import React from "react";
import {
  STATUS_LABELS,
  STATUS_COLOR,
  STATUS_DESCRIPTIONS,
} from "../../../lib/workflowConstants";

interface StatusBadgeProps {
  status: string;
  size?: "sm" | "md" | "lg";
  showDescription?: boolean;
}

export const StatusBadge = ({
  status,
  size = "md",
  showDescription = false,
}: StatusBadgeProps) => {
  const label = STATUS_LABELS[status] || status;
  const color = STATUS_COLOR[status] || "bg-gray-100 text-gray-800";
  const description = STATUS_DESCRIPTIONS[status];

  const sizeClasses = {
    sm: "px-2 py-1 text-xs",
    md: "px-3 py-1 text-sm",
    lg: "px-4 py-2 text-base",
  };

  return (
    <div>
      <span
        className={`inline-block rounded-full font-semibold ${color} ${sizeClasses[size]}`}
      >
        {label}
      </span>
      {showDescription && description && (
        <p className="text-xs text-muted-foreground mt-1">{description}</p>
      )}
    </div>
  );
};

export default StatusBadge;
