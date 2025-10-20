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
  const text = label ?? STATUS_LABELS[status];
  return (
    <span className={`badge ${status}`} aria-label={text} title={text}>
      {text}
    </span>
  );
};

export default RAGChip;
