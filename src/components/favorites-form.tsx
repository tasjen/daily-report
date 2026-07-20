import { useAutoAnimate } from "@formkit/auto-animate/react";
import { PlusIcon, StarIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/shared/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/shared/dialog";
import { Input } from "@/components/shared/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/shared/tooltip";
import { useSaveFavoritesMutation } from "@/lib/mutations";
import { useFavorites } from "@/lib/queries";

export default function FavoritesForm() {
  const { data: favorites } = useFavorites();
  const saveFavorites = useSaveFavoritesMutation();
  const [text, setText] = useState("");
  const [projectKey, setProjectKey] = useState("");
  const [listRef] = useAutoAnimate();

  // The trimmed text is the favorite's identity, so adding is disabled for
  // an empty result or an exact duplicate of an existing favorite. The
  // project key is optional and not part of the identity — it can be a real
  // Jira project key or any custom label, as long as it matches a Project
  // mapping entry. Normalized to uppercase like the project_map keys so the
  // date card's lookup can't miss on casing.
  const trimmed = text.trim();
  const trimmedKey = projectKey.trim().toUpperCase();
  const canAdd = Boolean(
    trimmed && favorites && !favorites.some((f) => f.text === trimmed),
  );

  function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canAdd || !favorites) return;
    saveFavorites.mutate([
      ...favorites,
      { text: trimmed, project_key: trimmedKey || null },
    ]);
    setText("");
    setProjectKey("");
  }

  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button size="icon-xl" variant="ghost">
            <StarIcon className="size-6" />
          </Button>
        }
      />
      <DialogContent initialFocus={false} className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <StarIcon />
            Favorites
          </DialogTitle>
        </DialogHeader>
        {favorites?.length ? (
          <ul ref={listRef} className="flex flex-col gap-1">
            {favorites.map((favorite) => (
              <li key={favorite.text} className="flex items-center gap-2">
                {favorite.project_key && (
                  <span className="flex-none rounded bg-muted px-1.5 py-0.5 font-mono text-muted-foreground text-xs">
                    {favorite.project_key}
                  </span>
                )}
                <span className="flex-1 break-all">{favorite.text}</span>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() =>
                    saveFavorites.mutate(
                      favorites.filter((f) => f.text !== favorite.text),
                    )
                  }
                >
                  <Trash2Icon />
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground italic">No favorites yet</p>
        )}
        <form onSubmit={handleAdd} className="flex gap-2">
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Add a favorite task"
          />
          <Tooltip>
            <TooltipTrigger
              render={
                <Input
                  value={projectKey}
                  onChange={(e) => setProjectKey(e.target.value)}
                  placeholder="Project key"
                  className="w-30 flex-none font-mono"
                />
              }
            />
            <TooltipContent>
              Optional project key (a Jira key or any custom one) — a favorite
              with a key follows the Project mapping preference into that
              project's form row; without one it goes into the first row
            </TooltipContent>
          </Tooltip>
          <Button type="submit" disabled={!canAdd}>
            <PlusIcon />
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
