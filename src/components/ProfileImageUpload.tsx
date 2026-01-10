import { useState, useRef } from "react";
import { Camera, Trash2, Upload } from "lucide-react";
import { supabase } from "../lib/supabase";

interface ProfileImageUploadProps {
  label: string;
  currentImageUrl: string | null;
  onImageUpdate: (newUrl: string | null) => void;
  userId: string;
  imagePath: "profile" | "mother" | "father"; // Determines the filename
  disabled?: boolean;
}

export default function ProfileImageUpload({
  label,
  currentImageUrl,
  onImageUpdate,
  userId,
  imagePath,
  disabled = false,
}: ProfileImageUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      alert("Please select an image file (JPG, PNG, GIF, WebP)");
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert("File size must be less than 5MB");
      return;
    }

    // Create preview
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);

    // Upload immediately
    await uploadImage(file);
  };

  const uploadImage = async (file: File) => {
    setUploading(true);
    try {
      const fileExtension = file.name.split(".").pop() || "jpg";
      const fileName = `${userId}/${imagePath}.${fileExtension}`;

      // Delete old file if exists
      if (currentImageUrl) {
        const oldPath = currentImageUrl.split("/profile-images/")[1];
        if (oldPath) {
          await supabase.storage.from("profile-images").remove([oldPath]);
        }
      }

      // Upload new file
      const { error: uploadError } = await supabase.storage
        .from("profile-images")
        .upload(fileName, file, {
          cacheControl: "3600",
          upsert: true,
        });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data } = supabase.storage
        .from("profile-images")
        .getPublicUrl(fileName);

      const publicUrl = data.publicUrl;

      // Update the database (parent component will handle this)
      onImageUpdate(publicUrl);

      // Clean up preview
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
      }
    } catch (error) {
      console.error("Upload error:", error);
      alert(
        `Failed to upload image: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );

      // Clean up preview on error
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
      }
    } finally {
      setUploading(false);
      // Clear file input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleDelete = async () => {
    if (!currentImageUrl) return;

    const confirmed = window.confirm(
      `Are you sure you want to delete this ${label.toLowerCase()}?`
    );
    if (!confirmed) return;

    setUploading(true);
    try {
      // Extract path from URL
      const path = currentImageUrl.split("/profile-images/")[1];
      if (path) {
        const { error } = await supabase.storage
          .from("profile-images")
          .remove([path]);

        if (error) throw error;
      }

      // Update database (parent component will handle this)
      onImageUpdate(null);
    } catch (error) {
      console.error("Delete error:", error);
      alert(
        `Failed to delete image: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    } finally {
      setUploading(false);
    }
  };

  const displayUrl = previewUrl || currentImageUrl;

  return (
    <div className="flex flex-col">
      <label className="text-slate-700 text-sm font-medium mb-2">{label}</label>

      <div className="relative group">
        {/* Image Display or Placeholder */}
        <div className="relative w-40 h-40 rounded-lg overflow-hidden border-2 border-slate-200 bg-slate-100 flex items-center justify-center">
          {displayUrl ? (
            <img
              src={displayUrl}
              alt={label}
              className="w-full h-full object-cover"
              onError={(e) => {
                console.error("Image failed to load:", displayUrl);
                e.currentTarget.src = "/placeholder-image.png";
              }}
            />
          ) : (
            <Camera className="w-12 h-12 text-slate-400" />
          )}

          {/* Upload overlay on hover */}
          {!disabled && (
            <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-40 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="bg-white text-slate-700 px-3 py-2 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors disabled:opacity-50"
              >
                <Upload className="w-4 h-4 inline mr-1" />
                {currentImageUrl ? "Change" : "Upload"}
              </button>
            </div>
          )}
        </div>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileSelect}
          className="hidden"
          disabled={disabled || uploading}
        />

        {/* Delete button */}
        {currentImageUrl && !disabled && (
          <button
            onClick={handleDelete}
            disabled={uploading}
            className="absolute -top-2 -right-2 bg-red-500 text-white p-2 rounded-full hover:bg-red-600 transition-colors shadow-md disabled:opacity-50"
            title="Delete image"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}

        {/* Upload button for mobile/touch devices */}
        {!currentImageUrl && !disabled && (
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="mt-2 w-40 bg-blue-600 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center"
          >
            <Upload className="w-4 h-4 mr-2" />
            {uploading ? "Uploading..." : "Upload Photo"}
          </button>
        )}
      </div>

      {/* Status text */}
      {uploading && <p className="text-xs text-blue-600 mt-2">Uploading...</p>}
      {!uploading && !currentImageUrl && !disabled && (
        <p className="text-xs text-slate-500 mt-2">Max 5MB, JPG/PNG/GIF/WebP</p>
      )}
    </div>
  );
}
