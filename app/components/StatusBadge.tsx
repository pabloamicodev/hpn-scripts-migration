interface StatusBadgeProps {
  status: "active" | "inactive" | "paused" | "error";
}

const statusLabels: Record<StatusBadgeProps["status"], string> = {
  active: "Active",
  inactive: "Inactive",
  paused: "Paused",
  error: "Error",
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const label = statusLabels[status];

  return (
    <span
      className={`status-badge status-badge--${status}`}
      role="status"
      aria-label={label}
    >
      {label}
    </span>
  );
}
