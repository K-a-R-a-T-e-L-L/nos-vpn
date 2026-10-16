import { Badge } from "@mantine/core";

type StatusBadgeProps = {
  label: string;
  color?: "brandCyan" | "brandOrange" | "brandMagenta" | "brandBlue" | "gray";
};

export default function StatusBadge({ label, color = "brandCyan" }: StatusBadgeProps) {
  return (
    <Badge color={color} variant="light" size="lg">
      {label}
    </Badge>
  );
}
