"use client";

/**
 * Full-screen **click-out + Escape** backdrop wrapping modal children.
 */

import { useEffect } from "react";

/**
 * Opacity variants for the modal backdrop overlay.
 * - `"light"` — bg-black/30 (subtle overlay, used in map editor dialogs)
 * - `"medium"` — bg-black/50 (standard modal overlay)
 * - `"heavy"` — bg-black/70 (high-contrast overlay for critical dialogs)
 */
type BackdropOpacity = "light" | "medium" | "heavy";

/** Props for the {@link ModalBackdrop} component. */
export interface ModalBackdropProps {
  /** Callback invoked when the user clicks outside the modal content or presses Escape. */
  onClose: () => void;
  /** The modal content to render centered within the backdrop. */
  children: React.ReactNode;
  /** Opacity variant for the backdrop. Defaults to `"light"`. */
  opacity?: BackdropOpacity;
}

const OPACITY_CLASS: Record<BackdropOpacity, string> = {
  light: "bg-black/30",
  medium: "bg-black/50",
  heavy: "bg-black/70",
};

/**
 * A reusable full-screen modal backdrop with blur effect.
 *
 * Renders a fixed overlay that covers the viewport and centers its children.
 * Closes when the user clicks on the backdrop (not on the children) or presses Escape.
 *
 * @example
 * ```tsx
 * <ModalBackdrop onClose={handleClose} opacity="medium">
 *   <div className="bg-white rounded-xl p-6">Modal content</div>
 * </ModalBackdrop>
 * ```
 */
export default function ModalBackdrop({
  onClose,
  children,
  opacity = "light",
}: ModalBackdropProps) {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div
      className={`fixed inset-0 ${OPACITY_CLASS[opacity]} backdrop-blur-sm flex items-center justify-center z-50`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {children}
    </div>
  );
}
