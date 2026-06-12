import { invoke } from "@tauri-apps/api/core";
import { PlayIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "./components/shared/button";

export default function OpenMemberPageButton() {
  const [isPending, setIsPending] = useState(false);
  return (
    <Button
      size="icon-xl"
      variant="ghost"
      disabled={isPending}
      onClick={async () => {
        setIsPending(true);
        try {
          await invoke("open_member_page");
        } catch {}
        setIsPending(false);
      }}
    >
      <PlayIcon className="size-6" />
    </Button>
  );
}
