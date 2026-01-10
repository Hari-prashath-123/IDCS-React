NOTICE BUCKET SETUP GUIDE
========================

This guide explains how to set up the 'notice' storage bucket for home page scrolling images.

## Overview
The 'notice' bucket is used to store images that will be displayed on the home page in a scrolling format. Only users with the 'notice' role can upload, update, and delete images in this bucket. All users can view the images since it's a public bucket.

## Setup Steps

### 1. Create the Bucket
Run the SQL script in Supabase SQL Editor:
```sql
-- Copy and paste the contents of supabase-notice-bucket.sql
```

### 2. Alternative: Use the Admin API Script
If you have the admin API server running:
```bash
npm run ensure-notice-bucket
```

## Bucket Policies

The bucket has the following policies:

- **Public Read Access**: Anyone can view images (for home page display)
- **Notice Role Upload**: Only users with 'notice' role can upload images
- **Notice Role Update**: Only users with 'notice' role can update images
- **Notice Role Delete**: Only users with 'notice' role can delete images

## Usage in Code

To upload images to the notice bucket:
```javascript
import { supabase } from '../lib/supabase';

const uploadImage = async (file) => {
  const fileName = `image-${Date.now()}.${file.name.split('.').pop()}`;

  const { data, error } = await supabase.storage
    .from('notice')
    .upload(fileName, file);

  if (error) {
    console.error('Upload error:', error);
    return null;
  }

  return data;
};
```

To get public URLs for images:
```javascript
const { data } = supabase.storage
  .from('notice')
  .getPublicUrl('image-name.jpg');

const publicUrl = data.publicUrl;
```

## File Organization
Images should be uploaded directly to the root of the 'notice' bucket. Consider using descriptive filenames like:
- `announcement-1.jpg`
- `event-banner-2025.jpg`
- `home-slider-01.png`

## Security Notes
- The bucket is public for read access to allow home page display
- Only notice role users can modify content
- Images are served via Supabase's CDN for optimal performance