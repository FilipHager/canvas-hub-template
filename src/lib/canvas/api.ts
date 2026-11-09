/**
 * Hög-nivå-funktioner: en funktion per sak vi hämtar från Canvas.
 * Allt är läsning (GET) via client.ts.
 */
import { canvasGet, canvasGetAll } from "./client";
import type {
  CanvasAnnouncement,
  CanvasAssignment,
  CanvasCourse,
  CanvasEvent,
  CanvasGroup,
  CanvasProfile,
  CanvasTodo,
  CanvasUser,
} from "./types";

export const getProfile = () => canvasGet<CanvasProfile>("/api/v1/users/self/profile");

export const getActiveCourses = () =>
  canvasGetAll<CanvasCourse>("/api/v1/courses", {
    enrollment_state: "active",
    "include[]": ["sections", "term"],
  });

/**
 * Meddelanden från alla angivna kurser.
 * OBS: utan start_date returnerar Canvas bara de senaste 14 dagarna,
 * därför skickar vi med ett eget datumintervall.
 */
export async function getAnnouncements(
  courseIds: number[],
  sinceDays = 120
): Promise<CanvasAnnouncement[]> {
  const start = new Date(Date.now() - sinceDays * 86_400_000);
  const end = new Date(Date.now() + 30 * 86_400_000); // inkl. schemalagda
  const all: CanvasAnnouncement[] = [];

  // Några kurser åt gången så att URL:en inte blir för lång.
  for (let i = 0; i < courseIds.length; i += 10) {
    const chunk = courseIds.slice(i, i + 10);
    const page = await canvasGetAll<CanvasAnnouncement>("/api/v1/announcements", {
      "context_codes[]": chunk.map((id) => `course_${id}`),
      start_date: start.toISOString().slice(0, 10),
      end_date: end.toISOString().slice(0, 10),
    });
    all.push(...page);
  }

  return all.sort(
    (a, b) =>
      new Date(b.posted_at ?? b.created_at).getTime() -
      new Date(a.posted_at ?? a.created_at).getTime()
  );
}

export const getMyGroups = () =>
  canvasGetAll<CanvasGroup>("/api/v1/users/self/groups", { "include[]": ["group_category"] });

export const getGroupMembers = (groupId: number) =>
  canvasGetAll<CanvasUser>(`/api/v1/groups/${groupId}/users`);

export const getAssignments = (courseId: number) =>
  canvasGetAll<CanvasAssignment>(`/api/v1/courses/${courseId}/assignments`, {
    "include[]": ["submission"],
    order_by: "due_at",
  });

export const getUpcomingEvents = () =>
  canvasGetAll<CanvasEvent>("/api/v1/users/self/upcoming_events");

export const getTodo = () => canvasGetAll<CanvasTodo>("/api/v1/users/self/todo");
