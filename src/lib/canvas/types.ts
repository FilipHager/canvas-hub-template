// Bara de fält vi faktiskt använder. Canvas skickar många fler.

export interface CanvasProfile {
  id: number;
  name: string;
  short_name: string;
  primary_email?: string;
  login_id?: string;
}

export interface CanvasSection {
  id: number;
  name: string;
}

export interface CanvasCourse {
  id: number;
  name: string;
  course_code: string;
  sections?: CanvasSection[];
  term?: { id: number; name: string; start_at: string | null; end_at: string | null };
}

export interface CanvasAnnouncement {
  id: number;
  title: string;
  message: string; // HTML
  posted_at: string | null;
  created_at: string;
  html_url: string;
  context_code: string; // t.ex. "course_12345"
  author?: { display_name?: string };
}

export interface CanvasGroup {
  id: number;
  name: string;
  course_id?: number;
  group_category_id?: number;
  group_category?: { id: number; name: string };
  members_count?: number;
}

export interface CanvasUser {
  id: number;
  name: string;
  short_name?: string;
}

export interface CanvasSubmission {
  workflow_state: "submitted" | "unsubmitted" | "graded" | "pending_review";
  submitted_at: string | null;
  missing?: boolean;
  late?: boolean;
}

export interface CanvasAssignment {
  id: number;
  name: string;
  due_at: string | null;
  html_url: string;
  course_id: number;
  description?: string | null;
  published?: boolean;
  submission?: CanvasSubmission;
}

export interface CanvasEvent {
  id: number | string;
  title: string;
  start_at: string | null;
  end_at: string | null;
  html_url: string;
  context_code?: string;
  location_name?: string | null;
  assignment?: CanvasAssignment;
}

export interface CanvasTodo {
  type: string;
  course_id?: number;
  html_url: string;
  assignment?: CanvasAssignment;
}
