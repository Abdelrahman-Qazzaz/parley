let count = 0;

/**
 * An id unique within this page, for things that exist only here until the
 * server names them. Not crypto.randomUUID: browsers only offer it on secure
 * pages, and the app can be opened over plain HTTP under a name that isn't
 * localhost.
 */
export function localId(): string {
  count += 1;
  return `${Date.now().toString(36)}-${count}`;
}
