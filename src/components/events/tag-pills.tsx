import { cn } from "@/lib/utils";

export function TagPills({
  tags,
  className,
}: {
  tags: string[];
  className?: string;
}) {
  if (tags.length === 0) return null;
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {tags.map((tag) => (
        <span
          key={tag}
          className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-700 dark:bg-white/10 dark:text-zinc-300"
        >
          {tag}
        </span>
      ))}
    </div>
  );
}
