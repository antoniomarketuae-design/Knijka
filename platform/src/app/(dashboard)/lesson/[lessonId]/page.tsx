import { permanentRedirect } from "next/navigation";
import "@/lib/content/loader";
import { lessonById } from "@/modules/lesson";

interface Props {
  params: Promise<{ lessonId: string }>;
}

/**
 * The old plain runner's URL → the room. See `../page.tsx` for why one engine
 * gets one front door and why this is a redirect rather than a delete.
 *
 * THE ID IS RESOLVED AGAINST THE CATALOGUE BEFORE IT IS PUT IN A PATH, and
 * that is not ceremony. `params` is decoded by the router, so
 * `/lesson/..%2F..%2Fsomewhere` arrives here as the string „../../somewhere"
 * and interpolating it would emit a Location the router resolves somewhere
 * else entirely. An id that names no lesson goes to the index instead — which
 * is also the friendlier answer for a stale bookmark.
 */
export default async function LessonRedirect({ params }: Props): Promise<never> {
  const { lessonId } = await params;
  const lesson = lessonById(lessonId);
  permanentRedirect(lesson === undefined ? "/classroom" : `/classroom/${lesson.id}`);
}
