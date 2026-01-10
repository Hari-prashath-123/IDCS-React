# Notice User Guide: Managing Home Page Content

## 🎯 Overview
As a notice user, you can control what appears on the KRCT home page carousel. Upload images and set custom titles/descriptions that will be displayed to all visitors.

## 📋 Setup Steps

### 1. Database Setup
Run this SQL in your **Supabase SQL Editor**:

```sql
-- Copy and paste the entire contents of supabase-notice-content.sql
```

**Alternative:** If you have admin access, run:
```bash
npm run setup-notice-content
```

### 2. Bucket Setup
Ensure the notice bucket exists with proper policies (see NOTICE_BUCKET_UI_SETUP.md)

## 🚀 How to Manage Home Page Content

### Login as Notice User
- **Email:** `notice@krct.ac.in`
- **Password:** `Password123!`
- **Dashboard:** `/notice-dashboard`

### Upload Images
1. Go to **Notice Dashboard**
2. In the "Home Page Images" section, click **"Upload Image"**
3. Select an image file (JPG, PNG, GIF, WebP - max 5MB)
4. The image will be uploaded with default content

### Edit Content
1. **Hover** over any uploaded image
2. Click the **blue edit button** (pencil icon)
3. **Edit the title and description** in the modal
4. Click **"Save Changes"**

### Delete Images
1. **Hover** over the image
2. Click the **red delete button** (trash icon)
3. **Confirm deletion** - this removes both the image and its content

## 📖 Content Guidelines

### Image Specifications
- **Format:** JPG, PNG, GIF, WebP
- **Size:** Maximum 5MB per image
- **Aspect Ratio:** 16:9 recommended (for best carousel display)
- **Resolution:** At least 1200x675px for crisp display

### Content Best Practices
- **Titles:** Keep under 50 characters, clear and engaging
- **Descriptions:** 1-2 sentences, highlight key information
- **Order:** Images display in upload order (newest first)

### Example Content
```
Title: "KRCT Achieves NAAC A++ Accreditation"
Description: "K.Ramakrishnan College of Technology proudly announces its NAAC A++ accreditation, reflecting our commitment to academic excellence and quality education."

Title: "Upcoming Tech Fest 2025"
Description: "Join us for Tech Fest 2025 featuring cutting-edge workshops, hackathons, and industry expert talks. Register now!"
```

## 🎨 What Visitors See

### Home Page Carousel
- **Images:** Your uploaded images in a rotating carousel
- **Titles:** Custom titles you set (displayed prominently)
- **Descriptions:** Your custom descriptions (shown below titles)
- **Navigation:** Previous/Next buttons and auto-rotation every 3 seconds

### Fallback Behavior
- If no notice images exist, the site shows default college images
- Once you upload notice images, they take priority

## 🔧 Technical Details

### Database Table: `notice_content`
- Stores titles, descriptions, and display settings
- Only notice users can edit
- Public read access for home page display

### Storage Bucket: `notice`
- Public bucket for fast image loading
- Images served via Supabase CDN
- Automatic public URLs generated

### Permissions
- **Upload/Update/Delete:** Only notice role users
- **View:** Public (for home page display)

## 📞 Support

If you encounter issues:
1. Check browser console for error messages
2. Ensure you're logged in as notice user
3. Verify bucket policies are set up correctly
4. Contact admin for database/bucket setup help

## 🎯 Quick Start Checklist

- [ ] Run SQL setup (supabase-notice-content.sql)
- [ ] Verify notice bucket exists with policies
- [ ] Login as notice user
- [ ] Upload your first image
- [ ] Edit title and description
- [ ] Check home page to see your content live

Your content will be live immediately after saving! 🚀