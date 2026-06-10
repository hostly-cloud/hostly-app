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

function IconOrderProducts() {
  return (
    <RowGlyph strokeWidth={1.5}>
      <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
    </RowGlyph>
  );
}

function IconDelete() {
  return (
    <RowGlyph>
      <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" />
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
  orderProductsTitle,
  onOrderProducts,
  orderProductsDisabled,
  deleteTitle,
  onDelete,
}: {
  isActive: boolean;
  editTitle: string;
  toggleTitle: string;
  onEdit: () => void;
  onToggle: () => void;
  disabled?: boolean;
  orderProductsTitle?: string;
  onOrderProducts?: () => void;
  orderProductsDisabled?: boolean;
  deleteTitle?: string;
  onDelete?: () => void;
}) {
  const orderDisabled = orderProductsDisabled || !onOrderProducts;
  return (
    <HostlyRowActions>
      {onOrderProducts ? (
        <HostlyRowActionButton
          variant="icon"
          disabled={orderDisabled}
          onClick={(e) => {
            e.stopPropagation();
            if (!orderDisabled) onOrderProducts();
          }}
          title={orderProductsTitle}
          aria-label={orderProductsTitle}
        >
          <IconOrderProducts />
        </HostlyRowActionButton>
      ) : null}
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
      {onDelete ? (
        <HostlyRowActionButton
          variant="icon"
          tone="danger"
          disabled={disabled}
          onClick={(e) => {
            e.stopPropagation();
            if (!disabled) onDelete();
          }}
          title={deleteTitle}
          aria-label={deleteTitle}
        >
          <IconDelete />
        </HostlyRowActionButton>
      ) : null}
    </HostlyRowActions>
  );
}
