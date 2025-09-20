import React, { useState, useRef, useEffect } from 'react';
import UploadIcon from './icons/UploadIcon';
import XIcon from './icons/XIcon';

interface ImageUploaderProps {
  label: string;
  onImageChange: (file: File | null) => void;
  onRemove: () => void;
  initialFile: File | null;
}

const ImageUploader: React.FC<ImageUploaderProps> = ({ label, onImageChange, onRemove, initialFile }) => {
  const [preview, setPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (initialFile) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreview(reader.result as string);
      };
      reader.readAsDataURL(initialFile);
    } else {
        setPreview(null);
    }
  }, [initialFile]);


  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
      onImageChange(file);
    } else {
      setPreview(null);
      onImageChange(null);
    }
  };

  const handleClick = () => {
    if (!preview) {
        fileInputRef.current?.click();
    }
  };

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    setPreview(null);
    onImageChange(null);
    if (fileInputRef.current) {
        fileInputRef.current.value = "";
    }
    onRemove();
  }

  return (
    <div className="flex flex-col items-center">
      <div
        onClick={handleClick}
        className="relative flex justify-center items-center w-24 h-24 bg-transparent dark:bg-olive/10 border-2 border-dashed border-olive/30 rounded-lg cursor-pointer hover:border-olive transition-colors duration-300"
      >
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          className="hidden"
          accept="image/*"
        />
        {preview ? (
          <>
            <img src={preview} alt="Preview" className="w-full h-full object-cover rounded-lg" />
            <button onClick={handleRemove} className="absolute top-1 right-1 bg-dark-olive bg-opacity-50 rounded-full p-1 text-cream hover:bg-opacity-75 transition-colors" aria-label="Remove image">
                <XIcon className="w-4 h-4" />
            </button>
          </>
        ) : (
          <div className="text-center text-olive/80 p-2">
            <UploadIcon className="mx-auto h-6 w-6" />
            <p className="mt-1 text-xs">{label}</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ImageUploader;
