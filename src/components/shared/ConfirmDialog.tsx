"use client";

import ModalBackdrop from "./ModalBackdrop";

/**
 * Visual variant for the confirm button.
 * - `"default"` — amber confirm button (general confirmations)
 * - `"destructive"` — red confirm button (delete, clear, resign actions)
 */
type ConfirmVariant = "default" | "destructive";

/** Props for the {@link ConfirmDialog} component. */
export interface ConfirmDialogProps {
  /** Title displayed at the top of the dialog in bold uppercase. */
  title: string;
  /** Descriptive message body explaining what the action will do. */
  message: string;
  /** Label for the confirm button. Defaults to `"Confirm"`. */
  confirmLabel?: string;
  /** Label for the cancel button. Defaults to `"Cancel"`. */
  cancelLabel?: string;
  /** Callback invoked when the user confirms the action. */
  onConfirm: () => void;
  /** Callback invoked when the user cancels (button click, backdrop click, or Escape). */
  onCancel: () => void;
  /** Use `"destructive"` for delete/clear actions. Defaults to `"default"`. */
  variant?: ConfirmVariant;
}

const CONFIRM_STYLES: Record<ConfirmVariant, string> = {
  default:
    "bg-amber-500 hover:bg-amber-400 text-white",
  destructive:
    "bg-red-500 hover:bg-red-600 text-white",
};

/**
 * A reusable confirmation dialog built on {@link ModalBackdrop}.
 *
 * Displays a title, message, and two action buttons (confirm + cancel).
 * Styled to match the existing SettingsPage ConfirmClearModal pattern
 * (rounded-xl, shadow-2xl, uppercase bold title).
 *
 * @example
 * ```tsx
 * <ConfirmDialog
 *   title="Clear Usage History"
 *   message="This will permanently delete all data. This cannot be undone."
 *   confirmLabel="Clear All Data"
 *   onConfirm={handleClear}
 *   onCancel={() => setShowConfirm(false)}
 *   variant="destructive"
 * />
 * ```
 */
export default function ConfirmDialog({
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
  variant = "default",
}: ConfirmDialogProps) {
  return (
    <ModalBackdrop onClose={onCancel} opacity="medium">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4 p-6">
        <h3 className="text-base font-bold text-gray-900 uppercase tracking-wide mb-2">
          {title}
        </h3>
        <p className="text-sm text-gray-600 leading-relaxed mb-6">{message}</p>
        <div className="flex gap-3">
          <button
            onClick={onConfirm}
            className={`flex-1 font-bold text-sm uppercase tracking-wider py-2.5 rounded-lg transition-colors ${CONFIRM_STYLES[variant]}`}
          >
            {confirmLabel}
          </button>
          <button
            onClick={onCancel}
            className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium text-sm py-2.5 rounded-lg transition-colors"
          >
            {cancelLabel}
          </button>
        </div>
      </div>
    </ModalBackdrop>
  );
}
