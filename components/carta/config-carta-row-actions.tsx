import type { SVGProps } from "react";
import { HostlyRowActionButton, HostlyRowActions } from "@/components/ui/hostly/data-table";

function RowGlyph(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={14}
      height={14}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.65}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    />
  );
}

function IconEdit() {
  return (
    <RowGlyph>
      <path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4 12.5-12.5z" />
    </RowGlyph>
  );
}

function IconToggleActive() {
  return (
    <RowGlyph strokeWidth={1.55}>
      <circle cx="12" cy="12" r="8.75" />
      <path d="M8 12h8" />
    </RowGlyph>
  );
}

function IconToggleInactive() {
  return (
    <RowGlyph>
      <path d="M12 5v14M5 12h14" />
    </RowGlyph>
  );
}

export function ConfigCartaEditToggleActions({
  isActive,
  editTitle,
  toggleTitle,
  onEdit,
  onToggle,
  disabled,
}: {
  isActive: boolean;
  editTitle: string;
  toggleTitle: string;
  onEdit: () => void;
  onToggle: () => void;
  disabled?: boolean;
}) {
  return (
    <HostlyRowActions>
      <HostlyRowActionButton
        variant="icon"
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          if (!disabled) onEdit();
        }}
        title={editTitle}
        aria-label={editTitle}
      >
        <IconEdit />
      </HostlyRowActionButton>
      <HostlyRowActionButton
        variant="icon"
        tone={isActive ? "warning" : "success"}
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          if (!disabled) onToggle();
        }}
        title={toggleTitle}
        aria-label={toggleTitle}
      >
        {isActive ? <IconToggleActive /> : <IconToggleInactive />}
      </HostlyRowActionButton>
    </HostlyRowActions>
  );
}
