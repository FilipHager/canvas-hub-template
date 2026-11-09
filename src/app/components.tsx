"use client";

import { useFormStatus } from "react-dom";

/** Knapp som visar "arbetar…" medan en server action körs. */
export function SubmitButton({
  children,
  pending: pendingLabel,
  className,
}: {
  children: React.ReactNode;
  pending: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={className}>
      {pending ? pendingLabel : children}
    </button>
  );
}
