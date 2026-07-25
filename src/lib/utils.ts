import { type ClassValue, clsx } from "clsx";
import { toast } from "sonner";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Surfaces a rejection to the user as an error toast. Returns void so it can be
// passed straight to `.catch()`/`onError` — those callbacks must not leak a
// value, and `toast.error` returns a toast id.
export function toastError(reason: unknown): void {
  toast.error(String(reason));
}
