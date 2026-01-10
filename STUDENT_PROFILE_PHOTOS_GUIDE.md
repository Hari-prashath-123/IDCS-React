# Student Profile Photos Setup Guide

## Overview

This feature adds the ability for students to upload and manage their profile images, as well as photos of their mother and father. All images are stored in Supabase Storage with proper security policies.

## Features Added

### 1. Database Schema

- **New columns in `students` table:**
  - `profile_image` - URL to student's profile picture
  - `mother_photo` - URL to mother's photo
  - `father_photo` - URL to father's photo

### 2. Storage Bucket

- **Bucket name:** `profile-images`
- **Access:** Public read, authenticated upload/update/delete
- **File structure:** `{user_id}/profile.{ext}`, `{user_id}/mother.{ext}`, `{user_id}/father.{ext}`
- **Size limit:** 5MB per image
- **Supported formats:** JPG, PNG, GIF, WebP

### 3. UI Components

- **ProfileImageUpload component:** Reusable component for uploading/managing images
  - Drag-and-drop interface
  - Image preview
  - Delete functionality
  - Real-time upload progress
  - Error handling

### 4. Profile Page Updates

- Profile header now displays uploaded profile image (fallback to initials)
- Edit mode includes dedicated photo upload section with all three images
- Images are displayed in a responsive grid layout

## Installation Steps

### Step 1: Run Database Migration

Execute the SQL migration to create the required columns and storage bucket:

```bash
# In Supabase SQL Editor, run:
f:\Github\NEW-IDCS\scripts\2026-01-04_add_student_photos.sql
```

Or use the Supabase CLI:

```bash
psql -h your-db-host -U postgres -d postgres -f scripts/2026-01-04_add_student_photos.sql
```

### Step 2: Verify Storage Bucket

1. Go to Supabase Dashboard → Storage
2. Verify that the `profile-images` bucket exists
3. Check that RLS policies are enabled:
   - Students can upload own profile images ✓
   - Anyone can view profile images ✓
   - Students can update own profile images ✓
   - Students can delete own profile images ✓

### Step 3: Test the Feature

1. Log in as a student
2. Navigate to Profile page
3. Click "Edit" button
4. Scroll to "Profile Photos" section
5. Upload profile image, mother's photo, and father's photo
6. Click "Save" to persist changes
7. Verify that the profile header displays the uploaded profile image

## File Structure

```
src/
├── components/
│   └── ProfileImageUpload.tsx       # Reusable image upload component
└── pages/
    └── ProfilePage.tsx              # Updated with photo upload UI

scripts/
└── 2026-01-04_add_student_photos.sql  # Database migration
```

## Usage

### For Students

1. Navigate to your profile page
2. Click the "Edit" button
3. In the "Profile Photos" section:
   - Click on any photo placeholder or hover over existing photos
   - Select an image file (max 5MB)
   - The image will upload automatically
   - To delete: Click the red trash icon on the photo
4. Click "Save" to save all profile changes

### For Developers

#### Using ProfileImageUpload Component

```tsx
import ProfileImageUpload from "../components/ProfileImageUpload";

<ProfileImageUpload
  label="Profile Image"
  currentImageUrl={student.profile_image}
  onImageUpdate={(url) => {
    // Handle image URL update
    updateStudent({ profile_image: url });
  }}
  userId={student.id}
  imagePath="profile" // or "mother" or "father"
  disabled={false}
/>;
```

## Security Considerations

### Row Level Security (RLS)

- Students can only upload to their own folder (`{user_id}/`)
- Students can only delete/update their own images
- All images are publicly viewable (bucket is public)

### File Validation

- Maximum file size: 5MB
- Allowed formats: JPG, PNG, GIF, WebP
- Files are validated on client-side before upload

### Storage Policies

```sql
-- Upload: Only to own folder
WITH CHECK (
  bucket_id = 'profile-images'
  AND (storage.foldername(name))[1] = auth.uid()::text
)

-- View: Public access
USING (bucket_id = 'profile-images')

-- Update/Delete: Only own files
USING (
  bucket_id = 'profile-images'
  AND (storage.foldername(name))[1] = auth.uid()::text
)
```

## Troubleshooting

### Images not uploading

1. Check browser console for errors
2. Verify storage bucket exists in Supabase Dashboard
3. Confirm RLS policies are enabled and correct
4. Check user is authenticated
5. Verify file size is under 5MB

### Images not displaying

1. Check that the URL is properly saved in database
2. Verify bucket is set to public
3. Check browser network tab for 404 or 403 errors
4. Confirm image URL format: `https://[project].supabase.co/storage/v1/object/public/profile-images/[user_id]/[filename]`

### Permission errors

1. Ensure user is authenticated
2. Verify user ID matches the folder name in storage
3. Check RLS policies in Supabase Dashboard → Storage → profile-images → Policies

## Future Enhancements

Potential improvements for future iterations:

- [ ] Image cropping/editing before upload
- [ ] Multiple profile pictures (gallery)
- [ ] Compression for large images
- [ ] Image optimization (WebP conversion)
- [ ] Profile picture history/versions
- [ ] Facial recognition for appropriate content
- [ ] Integration with other profile pages (HOD, AHOD, Staff views)

## API Reference

### ProfileImageUpload Props

| Prop              | Type                                | Description                             | Required            |
| ----------------- | ----------------------------------- | --------------------------------------- | ------------------- |
| `label`           | `string`                            | Display label for the upload field      | Yes                 |
| `currentImageUrl` | `string \| null`                    | Current image URL from database         | Yes                 |
| `onImageUpdate`   | `(url: string \| null) => void`     | Callback when image is uploaded/deleted | Yes                 |
| `userId`          | `string`                            | User's UUID for folder path             | Yes                 |
| `imagePath`       | `'profile' \| 'mother' \| 'father'` | Determines filename in storage          | Yes                 |
| `disabled`        | `boolean`                           | Disables upload/delete actions          | No (default: false) |

## Support

For issues or questions:

1. Check this guide first
2. Review browser console errors
3. Check Supabase Dashboard for storage/policy issues
4. Contact the development team with error details

---

**Last Updated:** January 4, 2026  
**Version:** 1.0.0  
**Author:** Development Team
