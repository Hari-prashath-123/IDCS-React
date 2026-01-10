// TypeScript interfaces for Django REST Framework API responses
// These follow typical DRF serializer field naming and pagination shape.

export type UserRole = 'student' | 'staff' | 'hod' | 'principal';

export interface User {
  // DRF typically uses numeric primary keys for User
  id: number;
  username: string;
  email: string;
  role: UserRole;
}

export interface AuthResponse {
  access: string; // access (JWT) token
  refresh: string; // refresh token
  user: User; // nested user object as returned by DRF serializer
}

export interface StudentProfile {
  id: number;
  user_id: number; // foreign key to User (DRF commonly exposes related id as user_id)
  register_number: string; // registration / roll number
  dept_id: number; // department foreign key id
  year: number;
  section: string;
}

export interface StaffProfile {
  id: number;
  user_id: number; // foreign key to User
  staff_id: string; // employee/staff identifier
  dept_id: number; // department foreign key id
  designation: string; // e.g., 'Lecturer', 'HOD'
}

// Helper: DRF standard paginated response shape
export interface DRFPaginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

// Common envelope for single-object responses (DRF often returns plain object)
export type DRFObject<T> = T;

export default {};
