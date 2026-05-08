'use client';
import { useState, useRef, ChangeEvent, DragEvent } from 'react';
import { Upload, File, X } from 'lucide-react';

interface FileDropzoneProps {
  onFileSelect: (file: File) => void;
  accept?: string;
  label?: string;
}

export function FileDropzone({ onFileSelect, accept, label }: FileDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrag = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setIsDragging(true);
    } else if (e.type === 'dragleave') {
      setIsDragging(false);
    }
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      setSelectedFile(file);
      onFileSelect(file);
    }
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      onFileSelect(file);
    }
  };

  const clearFile = () => {
    setSelectedFile(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div className="w-full">
      {label && <label className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1.5 block font-bold">{label}</label>}
      
      {!selectedFile ? (
        <div
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={`
            relative w-full aspect-[4/1] flex flex-col items-center justify-center rounded-2xl border-2 border-dashed transition-all cursor-pointer
            ${isDragging ? 'border-amber-500 bg-amber-500/5' : 'border-zinc-800 hover:border-zinc-700 bg-zinc-900/30'}
          `}
        >
          <input
            ref={inputRef}
            type="file"
            accept={accept}
            onChange={handleChange}
            className="hidden"
          />
          <Upload className={`mb-2 transition-colors ${isDragging ? 'text-amber-500' : 'text-zinc-600'}`} size={24} />
          <p className="text-xs text-zinc-400 font-medium">Dosyayı buraya sürükleyin veya seçin</p>
          <p className="text-[10px] text-zinc-600 mt-1">{accept || 'Tüm dosyalar'}</p>
        </div>
      ) : (
        <div className="flex items-center justify-between p-4 bg-zinc-900/50 border border-zinc-800 rounded-2xl">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-500/10 rounded-lg">
              <File className="text-amber-500" size={20} />
            </div>
            <div>
              <p className="text-sm font-bold text-zinc-200 truncate max-w-[200px]">{selectedFile.name}</p>
              <p className="text-[10px] text-zinc-500">{(selectedFile.size / 1024).toFixed(1)} KB</p>
            </div>
          </div>
          <button onClick={clearFile} className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-500 hover:text-zinc-300 transition-colors">
            <X size={18} />
          </button>
        </div>
      )}
    </div>
  );
}
