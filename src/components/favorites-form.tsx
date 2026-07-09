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
import { useSaveFavoritesMutation } from "@/lib/mutations";
import { useFavorites } from "@/lib/queries";

export default function FavoritesForm() {
  const { data: favorites } = useFavorites();
  const saveFavorites = useSaveFavoritesMutation();
  const [text, setText] = useState("");
  const [listRef] = useAutoAnimate();

  // The trimmed text is the favorite's identity, so adding is disabled for
  // an empty result or an exact duplicate of an existing favorite.
  const trimmed = text.trim();
  const canAdd = Boolean(trimmed && favorites && !favorites.includes(trimmed));

  function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canAdd || !favorites) return;
    saveFavorites.mutate([...favorites, trimmed]);
    setText("");
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
              <li key={favorite} className="flex items-center gap-2">
                <span className="flex-1 break-all">{favorite}</span>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() =>
                    saveFavorites.mutate(
                      favorites.filter((f) => f !== favorite),
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
          <Button type="submit" disabled={!canAdd}>
            <PlusIcon />
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
