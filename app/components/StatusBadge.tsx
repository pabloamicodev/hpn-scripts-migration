interface StatusBadgeProps {
  status: "active" | "inactive" | "paused" | "error";
}

const statusStyles: Record<StatusBadgeProps["status"], { bg: string; text: string; label: string }> = {
  active: { bg: "#dcfce7", text: "#166534", label: "Active" },
  inactive: { bg: "#f3f4f6", text: "#374151", label: "Inactive" },
  paused: { bg: "#fef3c7", text: "#92400e", label: "Paused" },
  error: { bg: "#fee2e2", text: "#991b1b", label: "Error" },
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const style = statusStyles[status];

  return (
    <span
      className="status-badge"
      style={{
        display: "inline-block",
        padding: "2px 10px",
        borderRadius: "9999px",
        fontSize: "0.75rem",
        fontWeight: 600,
        backgroundColor: style.bg,
        color: style.text,
        lineHeight: "1.25rem",
      }}
      role="status"
      aria-label={style.label}
    >
      {style.label}
    </span>
  );
}
