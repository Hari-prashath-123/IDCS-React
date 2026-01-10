// Re-export only types and helper functions from the archived Supabase file
import type {
  UserRole,
  ApplicationType,
  ApplicationStatus,
  ApproverLevel,
  Profile,
  Student,
  Staff,
  Application,
  ODApplication,
  LeaveApplication,
  GatepassApplication,
  BonafideApplication,
  AnyApplication,
  Approval,
  Notice,
  Certificate,
} from './supabase.archived';

export type {
  UserRole,
  ApplicationType,
  ApplicationStatus,
  ApproverLevel,
  Profile,
  Student,
  Staff,
  Application,
  ODApplication,
  LeaveApplication,
  GatepassApplication,
  BonafideApplication,
  AnyApplication,
  Approval,
  Notice,
  Certificate,
};

// Export helpers
export { getApplicationTableName, getApprovalsTableName } from './supabase.archived';
