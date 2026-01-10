import { useAuth } from '../../contexts/AuthContext';
import DashboardLayout from '../../components/DashboardLayout';
import { Home, Bell, FileText, Image, Upload, Trash2, Edit3 } from 'lucide-react';
import { useState } from 'react';
import { useNoticeImages, NoticeImageWithContent } from '../../hooks/useNoticeImages';
import { supabase } from '../../lib/supabase';

export default function ManageNotices() {
  const { profile } = useAuth();
  const { images, loading, error, refetch, updateContent, deleteImage } = useNoticeImages();
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [inlineEditing, setInlineEditing] = useState<{[key: string]: { title: string; description: string; link: string; linkText: string }}>({});
  const [savingInline, setSavingInline] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadDescription, setUploadDescription] = useState('');
  const [uploadLink, setUploadLink] = useState('');
  const [uploadLinkText, setUploadLinkText] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const sidebarItems = [
    { label: 'Dashboard', path: '/notice-dashboard', icon: <Home className="h-5 w-5" /> },
    { label: 'Notifications', path: '/notifications', icon: <Bell className="h-5 w-5" /> },
    { label: 'Manage Notices', path: '/notice/manage', icon: <FileText className="h-5 w-5" /> },
  ];

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setUploadError('Please select an image file');
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setUploadError('File size must be less than 5MB');
      return;
    }

    // Clean up previous preview URL
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    // Create new preview URL
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    setSelectedFile(file);
    setUploadError(null);
  };

  const handleUploadWithDetails = async () => {
    if (!selectedFile) {
      setUploadError('Please select an image file');
      return;
    }

    if (!uploadTitle.trim()) {
      setUploadError('Please enter a title');
      return;
    }

    if (!uploadDescription.trim()) {
      setUploadError('Please enter a description');
      return;
    }

    try {
      setUploading(true);
      setUploadError(null);

      // Create a custom file name with title for better organization
      const fileExtension = selectedFile.name.split('.').pop();
      const customFileName = `image-${Date.now()}-${uploadTitle.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}.${fileExtension}`;

      // Upload the file with custom name
      await supabase.storage
        .from('notice')
        .upload(customFileName, selectedFile, {
          cacheControl: '3600',
          upsert: false
        });

      // Create content record. Build payload conditionally so we don't reference
      // columns that may not exist in the database (avoids PGRST204 errors).
      const payload: any = {
        image_name: customFileName,
        title: uploadTitle.trim(),
        description: uploadDescription.trim(),
        display_order: images.length,
        is_active: true,
      };

      // Only include optional columns when the user provided values.
      // This prevents trying to insert into columns that don't exist in the
      // PostgREST schema cache (which causes the PGRST204 error shown).
      if (uploadLink.trim()) payload.link = uploadLink.trim();
      if (uploadLinkText.trim()) payload.link_text = uploadLinkText.trim();

      const { error: contentError } = await supabase.from('notice_content').insert(payload);

      if (contentError) {
        console.warn('Error creating content:', contentError);
        // Try to delete the uploaded file if content creation failed
        await supabase.storage.from('notice').remove([customFileName]);
        throw contentError;
      }

      // Reset form
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
      }
      setSelectedFile(null);
      setUploadTitle('');
      setUploadDescription('');
      setUploadLink('');
      setUploadLinkText('');
      
      // Clear file input
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      if (fileInput) fileInput.value = '';

      // Refresh the images list
      await refetch();

    } catch (error) {
      console.error('Upload error:', error);
      setUploadError(error instanceof Error ? error.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const cancelUpload = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    setSelectedFile(null);
    setUploadTitle('');
    setUploadDescription('');
    setUploadLink('');
    setUploadLinkText('');
    setUploadError(null);
    
    // Clear file input
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    if (fileInput) fileInput.value = '';
  };

  const handleDeleteImage = async (fileName: string) => {
    const image = images.find(img => img.name === fileName);
    const title = image?.content?.title || fileName;
    
    const confirmed = window.confirm(
      `Are you sure you want to delete this carousel image?\n\n` +
      `Title: ${title}\n` +
      `File: ${fileName}\n\n` +
      `This action cannot be undone and will remove the image from the home page carousel.`
    );
    
    if (!confirmed) return;

    try {
      setUploading(true);
      await deleteImage(fileName);
    } catch (error) {
      console.error('Delete error:', error);
      alert('Failed to delete image: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setUploading(false);
    }
  };

  const startInlineEdit = (image: NoticeImageWithContent) => {
    setInlineEditing(prev => ({
      ...prev,
      [image.name]: {
        title: image.content?.title || '',
        description: image.content?.description || '',
        link: image.content?.link || '',
        linkText: image.content?.link_text || ''
      }
    }));
  };

  const cancelInlineEdit = (imageName: string) => {
    setInlineEditing(prev => {
      const newState = { ...prev };
      delete newState[imageName];
      return newState;
    });
  };

  const saveInlineEdit = async (imageName: string) => {
    const edits = inlineEditing[imageName];
    if (!edits) return;

    setSavingInline(imageName);
    try {
      await updateContent(imageName, edits.title, edits.description, edits.link, edits.linkText);
      cancelInlineEdit(imageName);
    } catch (error) {
      alert('Failed to update content: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setSavingInline(null);
    }
  };

  const updateInlineField = (imageName: string, field: 'title' | 'description' | 'link' | 'linkText', value: string) => {
    setInlineEditing(prev => ({
      ...prev,
      [imageName]: {
        ...prev[imageName],
        [field]: value
      }
    }));
  };

  return (
    <DashboardLayout sidebarItems={sidebarItems}>
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-800">Manage Home Page Carousel</h1>
          <p className="text-slate-600 mt-1">Upload and manage carousel images displayed on the home page</p>
        </div>

        {/* Role Check */}
        {(!profile || profile?.role !== 'notice') && (
          <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <div className="flex items-center">
              <div className="text-yellow-600 mr-3">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <div>
                <h3 className="text-yellow-800 font-medium">Access Restricted</h3>
                <p className="text-yellow-700 text-sm">
                  {!profile 
                    ? 'You must be logged in to access this page.'
                    : `You need to be logged in with a 'notice' role to manage carousel images. Current role: ${profile.role || 'None'}`
                  }
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Home Page Carousel Management */}
        <div className="bg-white rounded-xl shadow border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-bold text-slate-800">Home Page Carousel Images</h2>
              <p className="text-sm text-slate-600 mt-1">
                Manage images currently displayed on the home page carousel ({images.length} active images)
              </p>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={() => refetch()}
                disabled={loading}
                className="flex items-center gap-2 px-3 py-2 text-sm bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 disabled:opacity-50"
                title="Refresh images list"
              >
                <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                {loading ? 'Refreshing...' : 'Refresh'}
              </button>
              <div className="text-right">
                <div className="text-xs text-slate-500">Status</div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                  <span className="text-sm font-medium text-green-600">Live on Home Page</span>
                </div>
              </div>
            </div>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-red-500" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                <span className="font-medium">Error loading images:</span>
              </div>
              <p className="mt-1 text-sm">{error}</p>
              <button
                onClick={() => refetch()}
                className="mt-2 text-sm text-red-600 hover:text-red-800 underline"
              >
                Try again
              </button>
            </div>
          )}

          {uploadError && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-red-500" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                <span className="font-medium">Upload error:</span>
              </div>
              <p className="mt-1 text-sm">{uploadError}</p>
            </div>
          )}

          {/* Image Frames Section */}
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-slate-800 mb-4">Carousel Image Frames</h3>
            <p className="text-sm text-slate-600 mb-4">
              Upload images to specific carousel positions. Each frame represents a position in the home page carousel rotation.
            </p>

            {/* Image Frames Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {loading ? (
                // Loading skeleton
                Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="border-2 border-slate-200 rounded-lg overflow-hidden bg-white shadow-sm">
                    <div className="bg-slate-100 px-4 py-3 border-b border-slate-200 animate-pulse">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 bg-slate-300 rounded-full"></div>
                          <div className="w-20 h-4 bg-slate-300 rounded"></div>
                        </div>
                        <div className="flex items-center gap-1">
                          <div className="w-2 h-2 bg-slate-300 rounded-full"></div>
                          <div className="w-12 h-3 bg-slate-300 rounded"></div>
                        </div>
                      </div>
                    </div>
                    <div className="aspect-video bg-slate-200 animate-pulse"></div>
                    <div className="p-4 bg-slate-50">
                      <div className="mb-2">
                        <div className="w-16 h-3 bg-slate-300 rounded mb-1"></div>
                        <div className="w-full h-8 bg-slate-200 rounded"></div>
                      </div>
                      <div className="mb-3">
                        <div className="w-20 h-3 bg-slate-300 rounded mb-1"></div>
                        <div className="w-full h-12 bg-slate-200 rounded"></div>
                      </div>
                      <div className="flex gap-2">
                        <div className="flex-1 h-6 bg-slate-300 rounded"></div>
                        <div className="flex-1 h-6 bg-slate-300 rounded"></div>
                      </div>
                    </div>
                  </div>
                ))
              ) : images.length === 0 ? (
                // No images state — show message and the Add New Image Frame so users can upload
                <>
                  <div className="col-span-full text-center py-8">
                    <Image className="h-16 w-16 text-slate-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-slate-600 mb-2">No Carousel Images</h3>
                    <p className="text-sm text-slate-500">
                      No images are currently running in the home page carousel. Upload your first image using the + frame below.
                    </p>
                  </div>

                  {/* Render the Add New Image Frame when there are no images */}
                  <div className="border-2 border-dashed border-slate-300 rounded-lg overflow-hidden bg-slate-50 hover:bg-slate-100 transition-colors">
                    {/* Frame Header */}
                    <div className="bg-slate-100 px-4 py-3 border-b border-slate-200">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 bg-slate-400 text-white rounded-full flex items-center justify-center text-xs font-bold">
                            +
                          </div>
                          <span className="text-sm font-medium text-slate-600">New Position</span>
                        </div>
                        <span className="text-xs text-slate-500">Position {images.length + 1}</span>
                      </div>
                    </div>

                    {/* Upload Area */}
                    <div className="relative aspect-video bg-slate-200 flex items-center justify-center">
                      {!selectedFile ? (
                        <label className="w-full h-full flex flex-col items-center justify-center cursor-pointer hover:bg-slate-300 transition-colors">
                          <Upload className="h-8 w-8 text-slate-400 mb-2" />
                          <span className="text-sm text-slate-600 font-medium">Upload Image</span>
                          <span className="text-xs text-slate-500 mt-1">Click to add</span>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleFileUpload}
                            className="hidden"
                            disabled={uploading}
                          />
                        </label>
                      ) : (
                        <div className="w-full h-full relative">
                          <img
                            src={previewUrl!}
                            alt="Selected image preview"
                            className="w-full h-full object-cover"
                          />
                          {/* Overlay with file info */}
                          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-3">
                            <p className="text-xs text-white font-medium truncate">{selectedFile.name}</p>
                            <p className="text-xs text-gray-200">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</p>
                          </div>
                        </div>
                      )}
                      {uploading && (
                        <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center">
                          <div className="text-center text-white">
                            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white mx-auto mb-2"></div>
                            <p className="text-sm">Uploading...</p>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Content Section */}
                    <div className="p-4">
                      {selectedFile ? (
                        <>
                          <div className="mb-3">
                            <label className="block text-xs font-medium text-slate-600 mb-1">Title *</label>
                            <input
                              type="text"
                              value={uploadTitle}
                              onChange={(e) => setUploadTitle(e.target.value)}
                              className="w-full px-2 py-2 text-sm border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                              placeholder="Enter image title..."
                              disabled={uploading}
                            />
                          </div>

                          <div className="mb-3">
                            <label className="block text-xs font-medium text-slate-600 mb-1">Description *</label>
                            <textarea
                              value={uploadDescription}
                              onChange={(e) => setUploadDescription(e.target.value)}
                              rows={3}
                              className="w-full px-2 py-2 text-sm border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
                              placeholder="Enter image description..."
                              disabled={uploading}
                            />
                          </div>

                          <div className="mb-3">
                            <label className="block text-xs font-medium text-slate-600 mb-1">Link</label>
                            <input
                              type="url"
                              value={uploadLink}
                              onChange={(e) => setUploadLink(e.target.value)}
                              className="w-full px-2 py-2 text-sm border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                              placeholder="https://example.com (optional)"
                              disabled={uploading}
                            />
                          </div>

                          <div className="mb-4">
                            <label className="block text-xs font-medium text-slate-600 mb-1">Link Text</label>
                            <input
                              type="text"
                              value={uploadLinkText}
                              onChange={(e) => setUploadLinkText(e.target.value)}
                              className="w-full px-2 py-2 text-sm border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                              placeholder="Read More, Learn More, etc. (optional)"
                              disabled={uploading}
                            />
                          </div>

                          <div className="flex gap-2">
                            <button
                              onClick={handleUploadWithDetails}
                              disabled={uploading || !uploadTitle.trim() || !uploadDescription.trim()}
                              className="flex-1 text-sm bg-blue-600 text-white py-2 px-3 rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {uploading ? 'Uploading...' : 'Upload Image'}
                            </button>
                            <button
                              onClick={cancelUpload}
                              disabled={uploading}
                              className="text-sm bg-slate-400 text-white py-2 px-3 rounded hover:bg-slate-500 disabled:opacity-50"
                            >
                              Cancel
                            </button>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="mb-3">
                            <label className="block text-xs font-medium text-slate-500 mb-1">Title</label>
                            <div className="w-full h-8 bg-slate-200 rounded animate-pulse"></div>
                          </div>

                          <div className="mb-3">
                            <label className="block text-xs font-medium text-slate-500 mb-1">Description</label>
                            <div className="w-full h-12 bg-slate-200 rounded animate-pulse"></div>
                          </div>

                          <div className="text-xs text-slate-400 text-center">
                            Upload an image to activate this position
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  {/* Existing Images Frames */}
                  {images.map((image, index) => (
                    <div key={image.name} className="border-2 border-green-200 rounded-lg overflow-hidden bg-white shadow-sm hover:shadow-md transition-shadow">
                      {/* Frame Header */}
                      <div className="bg-green-50 px-4 py-3 border-b border-green-200">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 bg-green-600 text-white rounded-full flex items-center justify-center text-xs font-bold">
                              {index + 1}
                            </div>
                            <span className="text-sm font-medium text-green-800">Position {index + 1}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                            <span className="text-xs text-green-600 font-medium">Live</span>
                          </div>
                        </div>
                      </div>

                      {/* Image Display */}
                      <div className="relative aspect-video bg-slate-100 group">
                        <img
                          src={image.publicUrl}
                          alt={image.content?.title || image.name}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            console.error('Image failed to load:', image.publicUrl);
                            e.currentTarget.src = '/placeholder-image.png';
                          }}
                        />
                        {/* Overlay with title and description */}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                          <div className="absolute bottom-0 left-0 right-0 p-4 text-white">
                            <h4 className="font-semibold text-lg mb-1 line-clamp-1">
                              {image.content?.title || 'No title set'}
                            </h4>
                            <p className="text-sm text-gray-200 line-clamp-2">
                              {image.content?.description || 'No description set'}
                            </p>
                          </div>
                        </div>
                        {/* Action buttons overlay */}
                        <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-40 transition-all flex items-center justify-center">
                          <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-all">
                            <button
                              onClick={() => startInlineEdit(image)}
                              className="p-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 transition-all"
                              title="Edit title and description"
                            >
                              <Edit3 className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteImage(image.name)}
                              className="p-2 bg-red-600 text-white rounded-full hover:bg-red-700 transition-all"
                              title="Delete image from carousel"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Content Section */}
                      <div className="p-4 bg-slate-50">
                        <div className="mb-2">
                          <div className="flex items-center justify-between mb-1">
                            <label className="block text-xs font-medium text-slate-600">Title</label>
                            <span className="text-xs text-slate-400">Position {index + 1}</span>
                          </div>
                          {inlineEditing[image.name] ? (
                            <input
                              type="text"
                              value={inlineEditing[image.name].title}
                              onChange={(e) => updateInlineField(image.name, 'title', e.target.value)}
                              className="w-full px-2 py-1 text-sm border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                              placeholder="Enter title..."
                            />
                          ) : (
                            <p className="text-sm font-semibold text-slate-800 bg-white p-2 rounded border min-h-[2rem] break-words">
                              {image.content?.title || 'No title set'}
                            </p>
                          )}
                        </div>

                        <div className="mb-3">
                          <label className="block text-xs font-medium text-slate-600 mb-1">Description</label>
                          {inlineEditing[image.name] ? (
                            <textarea
                              value={inlineEditing[image.name].description}
                              onChange={(e) => updateInlineField(image.name, 'description', e.target.value)}
                              rows={2}
                              className="w-full px-2 py-1 text-sm border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
                              placeholder="Enter description..."
                            />
                          ) : (
                            <p className="text-sm text-slate-600 bg-white p-2 rounded border min-h-[3rem] line-clamp-3 break-words">
                              {image.content?.description || 'No description set'}
                            </p>
                          )}
                        </div>

                        <div className="mb-3">
                          <label className="block text-xs font-medium text-slate-600 mb-1">Link</label>
                          {inlineEditing[image.name] ? (
                            <input
                              type="url"
                              value={inlineEditing[image.name].link}
                              onChange={(e) => updateInlineField(image.name, 'link', e.target.value)}
                              className="w-full px-2 py-1 text-sm border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                              placeholder="https://example.com (optional)"
                            />
                          ) : (
                            <p className="text-sm text-slate-600 bg-white p-2 rounded border min-h-[2rem] break-words">
                              {image.content?.link || 'No link set'}
                            </p>
                          )}
                        </div>

                        <div className="mb-3">
                          <label className="block text-xs font-medium text-slate-600 mb-1">Link Text</label>
                          {inlineEditing[image.name] ? (
                            <input
                              type="text"
                              value={inlineEditing[image.name].linkText}
                              onChange={(e) => updateInlineField(image.name, 'linkText', e.target.value)}
                              className="w-full px-2 py-1 text-sm border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                              placeholder="Read More, Learn More, etc. (optional)"
                            />
                          ) : (
                            <p className="text-sm text-slate-600 bg-white p-2 rounded border min-h-[2rem] break-words">
                              {image.content?.link_text || 'No link text set'}
                            </p>
                          )}
                        </div>

                        {/* Action Buttons */}
                        <div className="flex gap-2">
                          {inlineEditing[image.name] ? (
                            <>
                              <button
                                onClick={() => saveInlineEdit(image.name)}
                                disabled={savingInline === image.name}
                                className="flex-1 text-xs bg-green-600 text-white py-1 px-2 rounded hover:bg-green-700 disabled:opacity-50"
                              >
                                {savingInline === image.name ? 'Saving...' : 'Save'}
                              </button>
                              <button
                                onClick={() => cancelInlineEdit(image.name)}
                                className="flex-1 text-xs bg-slate-400 text-white py-1 px-2 rounded hover:bg-slate-500"
                              >
                                Cancel
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => startInlineEdit(image)}
                                className="flex-1 text-xs bg-blue-600 text-white py-1 px-2 rounded hover:bg-blue-700"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => handleDeleteImage(image.name)}
                                className="flex-1 text-xs bg-red-600 text-white py-1 px-2 rounded hover:bg-red-700"
                              >
                                Delete
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}

                  {/* Add New Image Frame */}
                  <div className="border-2 border-dashed border-slate-300 rounded-lg overflow-hidden bg-slate-50 hover:bg-slate-100 transition-colors">
                    {/* Frame Header */}
                    <div className="bg-slate-100 px-4 py-3 border-b border-slate-200">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 bg-slate-400 text-white rounded-full flex items-center justify-center text-xs font-bold">
                            +
                          </div>
                          <span className="text-sm font-medium text-slate-600">New Position</span>
                        </div>
                        <span className="text-xs text-slate-500">Position {images.length + 1}</span>
                      </div>
                    </div>

                    {/* Upload Area */}
                    <div className="relative aspect-video bg-slate-200 flex items-center justify-center">
                      {!selectedFile ? (
                        <label className="w-full h-full flex flex-col items-center justify-center cursor-pointer hover:bg-slate-300 transition-colors">
                          <Upload className="h-8 w-8 text-slate-400 mb-2" />
                          <span className="text-sm text-slate-600 font-medium">Upload Image</span>
                          <span className="text-xs text-slate-500 mt-1">Click to add</span>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleFileUpload}
                            className="hidden"
                            disabled={uploading}
                          />
                        </label>
                      ) : (
                        <div className="w-full h-full relative">
                          <img
                            src={previewUrl!}
                            alt="Selected image preview"
                            className="w-full h-full object-cover"
                          />
                          {/* Overlay with file info */}
                          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-3">
                            <p className="text-xs text-white font-medium truncate">{selectedFile.name}</p>
                            <p className="text-xs text-gray-200">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</p>
                          </div>
                        </div>
                      )}
                      {uploading && (
                        <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center">
                          <div className="text-center text-white">
                            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white mx-auto mb-2"></div>
                            <p className="text-sm">Uploading...</p>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Content Section */}
                    <div className="p-4">
                      {selectedFile ? (
                        <>
                          <div className="mb-3">
                            <label className="block text-xs font-medium text-slate-600 mb-1">Title *</label>
                            <input
                              type="text"
                              value={uploadTitle}
                              onChange={(e) => setUploadTitle(e.target.value)}
                              className="w-full px-2 py-2 text-sm border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                              placeholder="Enter image title..."
                              disabled={uploading}
                            />
                          </div>

                          <div className="mb-3">
                            <label className="block text-xs font-medium text-slate-600 mb-1">Description *</label>
                            <textarea
                              value={uploadDescription}
                              onChange={(e) => setUploadDescription(e.target.value)}
                              rows={3}
                              className="w-full px-2 py-2 text-sm border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
                              placeholder="Enter image description..."
                              disabled={uploading}
                            />
                          </div>

                          <div className="mb-3">
                            <label className="block text-xs font-medium text-slate-600 mb-1">Link</label>
                            <input
                              type="url"
                              value={uploadLink}
                              onChange={(e) => setUploadLink(e.target.value)}
                              className="w-full px-2 py-2 text-sm border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                              placeholder="https://example.com (optional)"
                              disabled={uploading}
                            />
                          </div>

                          <div className="mb-4">
                            <label className="block text-xs font-medium text-slate-600 mb-1">Link Text</label>
                            <input
                              type="text"
                              value={uploadLinkText}
                              onChange={(e) => setUploadLinkText(e.target.value)}
                              className="w-full px-2 py-2 text-sm border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                              placeholder="Read More, Learn More, etc. (optional)"
                              disabled={uploading}
                            />
                          </div>

                          <div className="flex gap-2">
                            <button
                              onClick={handleUploadWithDetails}
                              disabled={uploading || !uploadTitle.trim() || !uploadDescription.trim()}
                              className="flex-1 text-sm bg-blue-600 text-white py-2 px-3 rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {uploading ? 'Uploading...' : 'Upload Image'}
                            </button>
                            <button
                              onClick={cancelUpload}
                              disabled={uploading}
                              className="text-sm bg-slate-400 text-white py-2 px-3 rounded hover:bg-slate-500 disabled:opacity-50"
                            >
                              Cancel
                            </button>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="mb-3">
                            <label className="block text-xs font-medium text-slate-500 mb-1">Title</label>
                            <div className="w-full h-8 bg-slate-200 rounded animate-pulse"></div>
                          </div>

                          <div className="mb-3">
                            <label className="block text-xs font-medium text-slate-500 mb-1">Description</label>
                            <div className="w-full h-12 bg-slate-200 rounded animate-pulse"></div>
                          </div>

                          <div className="text-xs text-slate-400 text-center">
                            Upload an image to activate this position
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Upload Instructions */}
            <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-start gap-3">
                <div className="text-blue-600 mt-0.5">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-blue-800">How it works:</h4>
                  <ul className="text-sm text-blue-700 mt-1 space-y-1">
                    <li>• Each frame represents a position in the carousel rotation</li>
                    <li>• Images appear in order from left to right, top to bottom</li>
                    <li>• Upload images to specific positions or use the + frame to add new ones</li>
                    <li>• Edit titles and descriptions directly in each frame</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
