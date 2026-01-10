import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export interface NoticeImage {
  name: string;
  id: string;
  updated_at: string;
  created_at: string;
  last_accessed_at: string;
  metadata: any;
  publicUrl: string;
}

export interface NoticeContent {
  id: string;
  image_name: string;
  title: string;
  description: string;
  link?: string;
  link_text?: string;
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface NoticeImageWithContent extends NoticeImage {
  content?: NoticeContent;
}

export function useNoticeImages() {
  const [images, setImages] = useState<NoticeImageWithContent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchImages();
  }, []);

  const fetchImages = async () => {
    try {
      setLoading(true);
      setError(null);

      console.log('useNoticeImages: Starting fetch...');

      // First, get all active content records - notice users can do this
      const { data: contentData, error: contentError } = await supabase
        .from('notice_content')
        .select('*')
        .eq('is_active', true)
        .order('display_order', { ascending: true });

      if (contentError) {
        console.error('useNoticeImages: Content fetch error:', contentError);
        throw contentError;
      }

      if (!contentData || contentData.length === 0) {
        console.log('useNoticeImages: No content records found');
        setImages([]);
        return;
      }

      console.log('useNoticeImages: Found content records:', contentData.length);
      contentData.forEach(content => {
        console.log('  - Content:', content.image_name, '->', content.title);
      });

      // Now create image objects from the content data
      // We assume the images exist in storage since they have content records
      const imagesWithUrls = contentData.map(content => {
        const publicUrl = supabase.storage
          .from('notice')
          .getPublicUrl(content.image_name).data.publicUrl;

        return {
          name: content.image_name,
          id: content.id, // Use content ID as file ID
          updated_at: content.updated_at,
          created_at: content.created_at,
          last_accessed_at: content.updated_at,
          metadata: null,
          publicUrl,
          content
        };
      });

      console.log('useNoticeImages: Final images with content:', imagesWithUrls.length);
      imagesWithUrls.forEach(img => {
        console.log('  - Image:', img.name, 'Content:', img.content ? 'YES' : 'NO');
      });

      setImages(imagesWithUrls);
    } catch (err) {
      console.error('useNoticeImages: Error fetching images:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch images');
    } finally {
      setLoading(false);
    }
  };

  const uploadImage = async (file: File, fileName?: string) => {
    try {
      const finalFileName = fileName || `image-${Date.now()}.${file.name.split('.').pop()}`;

      const { data, error } = await supabase.storage
        .from('notice')
        .upload(finalFileName, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (error) {
        throw error;
      }

      // Create default content for the new image
      const defaultTitle = `Notice ${finalFileName}`;
      const defaultDescription = "Latest updates and announcements from KRCT.";

      const { error: contentError } = await supabase
        .from('notice_content')
        .insert({
          image_name: finalFileName,
          title: defaultTitle,
          description: defaultDescription,
          display_order: images.length,
          is_active: true
        });

      if (contentError) {
        console.warn('Error creating default content:', contentError);
      }

      // Refresh the images list
      await fetchImages();

      return data;
    } catch (err) {
      console.error('Error uploading image:', err);
      throw err;
    }
  };

  const updateContent = async (imageName: string, title: string, description: string, link?: string, linkText?: string, displayOrder?: number) => {
    try {
      const updateData: any = {
        title,
        description,
        updated_at: new Date().toISOString()
      };

      if (link !== undefined) {
        updateData.link = link || null;
      }

      if (linkText !== undefined) {
        updateData.link_text = linkText || null;
      }

      if (displayOrder !== undefined) {
        updateData.display_order = displayOrder;
      }

      const { error } = await supabase
        .from('notice_content')
        .update(updateData)
        .eq('image_name', imageName);

      if (error) {
        throw error;
      }

      // Refresh the images list
      await fetchImages();
    } catch (err) {
      console.error('Error updating content:', err);
      throw err;
    }
  };

  const deleteImage = async (fileName: string) => {
    try {
      // Delete from storage
      const { error: storageError } = await supabase.storage
        .from('notice')
        .remove([fileName]);

      if (storageError) {
        throw storageError;
      }

      // Delete content metadata
      const { error: contentError } = await supabase
        .from('notice_content')
        .delete()
        .eq('image_name', fileName);

      if (contentError) {
        console.warn('Error deleting content:', contentError);
      }

      // Refresh the images list
      await fetchImages();
    } catch (err) {
      console.error('Error deleting image:', err);
      throw err;
    }
  };

  return {
    images,
    loading,
    error,
    refetch: fetchImages,
    uploadImage,
    updateContent,
    deleteImage
  };
}