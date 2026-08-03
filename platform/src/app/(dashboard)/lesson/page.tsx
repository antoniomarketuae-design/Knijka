import { permanentRedirect } from "next/navigation";

/**
 * ONE ENGINE, ONE FRONT DOOR.
 *
 * `/lesson` and `/classroom` shipped on the same day, 28 July, over the same
 * `@/modules/lesson` engine, and NEITHER was reachable: the classroom was in
 * no nav and no `ROUTE_STATUS`, and this route was linked from nowhere at all.
 * Two front doors to one feature is not redundancy, it is two places for a fix
 * to have to land — and the one a student would actually be sent to (the room,
 * with the teacher, the board and the ask bar) is the other one. The plain
 * runner here rendered the same beats with none of that.
 *
 * REDIRECTED RATHER THAN DELETED. The route was live for a week, so a URL may
 * exist in a bookmark, a chat message or a founder-review note; a 308 lands
 * those on the real room, while a delete lands them on a raw Next 404. It
 * costs six lines and it can be removed once the logs stop showing hits.
 *
 * There is no `ROUTE_STATUS` entry for `/lesson` and there must not be: that
 * map is what the nav and the hub cards render from, and a redirect is not a
 * destination. `/classroom` is the entry, and it is already „live".
 */
export default async function LessonIndexRedirect(): Promise<never> {
  permanentRedirect("/classroom");
}
