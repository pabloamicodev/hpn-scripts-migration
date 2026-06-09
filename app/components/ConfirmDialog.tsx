import { useEffect, useId, useRef } from "react";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: "danger" | "warning";
  pending?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  tone = "danger",
  pending = false,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
    }

    if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const currentDialog = dialog;

    function handleClose() {
      onClose();
    }

    function handleClick(event: MouseEvent) {
      if (event.target !== currentDialog) return;

      const rect = currentDialog.getBoundingClientRect();
      const clickedInside =
        rect.top <= event.clientY &&
        event.clientY <= rect.top + rect.height &&
        rect.left <= event.clientX &&
        event.clientX <= rect.left + rect.width;

      if (!clickedInside) {
        currentDialog.close();
      }
    }

    currentDialog.addEventListener("close", handleClose);
    currentDialog.addEventListener("click", handleClick);

    return () => {
      currentDialog.removeEventListener("close", handleClose);
      currentDialog.removeEventListener("click", handleClick);
    };
  }, [onClose]);

  return (
    <dialog
      ref={dialogRef}
      className={`confirm-dialog confirm-dialog--${tone}`}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
    >
      <form method="dialog" className="confirm-dialog__surface">
        <div className="confirm-dialog__mark" aria-hidden="true">
          !
        </div>
        <div className="confirm-dialog__copy">
          <h2 id={titleId} className="confirm-dialog__title">
            {title}
          </h2>
          <p id={descriptionId} className="confirm-dialog__description">
            {description}
          </p>
        </div>
        <div className="confirm-dialog__actions">
          <button type="submit" className="btn" disabled={pending}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`btn ${
              tone === "danger" ? "btn--danger" : "btn--warning"
            }`}
            disabled={pending}
            onClick={onConfirm}
          >
            {pending ? "Working…" : confirmLabel}
          </button>
        </div>
      </form>
    </dialog>
  );
}
