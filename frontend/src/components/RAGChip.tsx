import React from "react";

type Status = "green" | "amber" | "red";

interface RAGChipProps {
  status: Status;
  label?: string;
}

const STATUS_LABELS: Record<Status, string> = {
  green: "Within range",
  amber: "Caution",
  red: "Outside range",
};

const RAGChip: React.FC<RAGChipProps> = ({ status, label }) => {
  return <span className={`badge ${status}`}>{label ?? STATUS_LABELS[status]}</span>;
};

export default RAGChip;
