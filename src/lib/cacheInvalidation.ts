// Automatic cache invalidation utilities
// Use these when updating data to ensure cache stays fresh

import { cache } from './cache';

/**
 * Invalidate cache when student data changes
 */
export function invalidateStudentCache(studentId?: string) {
  if (studentId) {
    cache.invalidatePattern(`student_${studentId}`);
  } else {
    cache.invalidatePattern('students');
    cache.invalidatePattern('principal_students');
  }
}

/**
 * Invalidate cache when attendance data changes
 */
export function invalidateAttendanceCache(studentId?: string) {
  if (studentId) {
    cache.invalidatePattern(`attendance_${studentId}`);
  } else {
    cache.invalidatePattern('attendance');
  }
}

/**
 * Invalidate cache when staff data changes
 */
export function invalidateStaffCache(staffId?: string) {
  if (staffId) {
    cache.invalidatePattern(`staff_${staffId}`);
  } else {
    cache.invalidatePattern('staff');
  }
}

/**
 * Invalidate cache when profile data changes
 */
export function invalidateProfileCache(profileId?: string) {
  if (profileId) {
    cache.invalidatePattern(`profile_${profileId}`);
  } else {
    cache.invalidatePattern('profile');
  }
}

/**
 * Invalidate cache when application data changes
 */
export function invalidateApplicationCache(appId?: string) {
  if (appId) {
    cache.invalidatePattern(`application_${appId}`);
  } else {
    cache.invalidatePattern('application');
  }
}

/**
 * Clear all cache (use for logout or major data changes)
 */
export function clearAllCache() {
  cache.clear();
}
