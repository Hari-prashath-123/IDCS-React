STEP-BY-STEP GUIDE: Setting up Notice Bucket for Home Page Images

=============================================================================
STEP 1: Create the Bucket
=============================================================================

1. Go to Supabase Dashboard → Storage
2. Click "Create bucket"
3. Fill in:
   - Name: notice
   - Make public: ✅ Enable (so home page can display images)
4. Click "Create bucket"

=============================================================================
STEP 2: Add Policies (Notice Users Can Upload)
=============================================================================

1. Click on the "notice" bucket
2. Go to "Policies" tab
3. Click "New policy"
4. Choose "Custom policy"
5. Fill in:

   Policy name: Notice users can upload images

   Policy definition:
   - Check: INSERT

   Target roles: authenticated

   USING expression: (leave blank)

   WITH CHECK expression:
   (bucket_id = 'notice' AND EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'notice'))

6. Click "Review" then "Save policy"

=============================================================================
STEP 3: Add Policy (Public Can View Images)
=============================================================================

1. Click "New policy" again
2. Choose "Custom policy"
3. Fill in:

   Policy name: Anyone can view notice images

   Policy definition:
   - Check: SELECT

   Target roles: public

   USING expression:
   (bucket_id = 'notice')

   WITH CHECK expression: (leave blank)

6. Click "Review" then "Save policy"

=============================================================================
STEP 4: Add Policy (Notice Users Can Update)
=============================================================================

1. Click "New policy" again
2. Choose "Custom policy"
3. Fill in:

   Policy name: Notice users can update images

   Policy definition:
   - Check: UPDATE

   Target roles: authenticated

   USING expression:
   (bucket_id = 'notice' AND EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'notice'))

   WITH CHECK expression:
   (bucket_id = 'notice' AND EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'notice'))

6. Click "Review" then "Save policy"

=============================================================================
STEP 5: Add Policy (Notice Users Can Delete)
=============================================================================

1. Click "New policy" again
2. Choose "Custom policy"
3. Fill in:

   Policy name: Notice users can delete images

   Policy definition:
   - Check: DELETE

   Target roles: authenticated

   USING expression:
   (bucket_id = 'notice' AND EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'notice'))

   WITH CHECK expression: (leave blank)

6. Click "Review" then "Save policy"

=============================================================================
QUICK ALTERNATIVE (If you want simple setup):
=============================================================================

Just add ONE policy that allows everything for notice users:

Policy name: Notice users can manage images
Policy definition: Check ALL (SELECT, INSERT, UPDATE, DELETE)
Target roles: authenticated
USING expression: (bucket_id = 'notice' AND EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'notice'))
WITH CHECK expression: (bucket_id = 'notice' AND EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'notice'))

And ONE policy for public viewing:

Policy name: Public can view images
Policy definition: Check SELECT
Target roles: public
USING expression: (bucket_id = 'notice')
WITH CHECK expression: (leave blank)

=============================================================================