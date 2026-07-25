import { useState } from "react";

import { toastError } from "@/lib/utils";

// How long the copy button stays in its "copied" state before reverting.
const COPIED_FEEDBACK_MS = 2000;

/**
 * Copy-to-clipboard with a transient "copied" acknowledgement.
 *
 * `copy` is a no-op while `isCopied` is set, so repeated clicks can't stack
 * timers that would cut the acknowledgement short.
 */
export function useCopyToClipboard() {
  const [isCopied, setIsCopied] = useState(false);

  function copy(text: string) {
    if (isCopied) return;
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), COPIED_FEEDBACK_MS);
      })
      .catch(toastError);
  }

  return { isCopied, copy };
}
