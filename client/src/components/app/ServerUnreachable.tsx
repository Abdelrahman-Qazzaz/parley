import { Icon } from "../ui/Icon";

/** Shown in place of the chat while this computer's app isn't running. */
export function ServerUnreachable() {
  return (
    <div className="flex flex-1 items-center justify-center px-6">
      <div className="max-w-sm text-center">
        <Icon name="alert" className="mx-auto h-6 w-6 text-faint" />
        <p className="mt-3 text-sm font-medium text-ink">
          The app on this computer isn't running
        </p>
        <p className="mt-1.5 text-sm text-muted">
          Start it, and this page picks it up within a few seconds.
        </p>
        {import.meta.env.DEV && (
          <p className="mt-3 font-mono text-[11px] text-faint">
            npm run dev:local
          </p>
        )}
      </div>
    </div>
  );
}
