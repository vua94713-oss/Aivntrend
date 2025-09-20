
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { generateTrendImage, enhanceImage, validateApiKey } from './services/geminiService';
import { Style } from './types';
import { STYLES, AFFILIATE_LINK } from './constants';
import ImageUploader from './components/ImageUploader';
import Footer from './Footer';
import PlusIcon from './components/icons/PlusIcon';
import MinusIcon from './components/icons/MinusIcon';
import DownloadIcon from './components/icons/DownloadIcon';
import ThemeSwitcher from './components/ThemeSwitcher';
import XIcon from './components/icons/XIcon';
import ArrowLeftIcon from './components/icons/ArrowLeftIcon';
import GearIcon from './components/icons/GearIcon';

const dataUrlToFile = async (dataUrl: string, fileName: string): Promise<File> => {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  return new File([blob], fileName, { type: blob.type });
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const translateApiError = (error: unknown): string => {
    // 1. Handle non-Error objects
    if (!(error instanceof Error)) {
        return "Đã xảy ra một lỗi không xác định. Vui lòng thử lại.";
    }

    const message = error.message;

    // 2. Invalid API Key
    if (message.includes("API key not valid") || message.includes("PERMISSION_DENIED")) {
        return "API Key bạn cung cấp không hợp lệ hoặc đã hết hạn.\n\nCách khắc phục:\n1. Kiểm tra lại xem bạn đã sao chép đúng Key chưa.\n2. Truy cập Google AI Studio để tạo một Key mới.";
    }

    // 3. Quota exhausted
    if (message.includes("RESOURCE_EXHAUSTED") || message.includes("429")) {
        // The handleApiError function provides a more specific message for the site's default key.
        // This message is for users who have provided their own key and it has run out.
        return "API Key của bạn đã hết hạn ngạch sử dụng.\n\nCách khắc phục:\n1. Vui lòng kiểm tra hạn ngạch trên trang quản lý Key của Google AI Studio.\n2. Thử lại sau một thời gian hoặc sử dụng một Key khác.";
    }

    // 4. Safety block
    if (message.includes("SAFETY")) {
        return "Yêu cầu của bạn đã bị chặn vì lý do an toàn. AI sẽ từ chối các nội dung nhạy cảm hoặc không phù hợp.\n\nCách khắc phục:\n- Vui lòng sử dụng một bức ảnh khác, thân thiện hơn.\n- Nếu dùng lệnh tùy chỉnh, hãy đảm bảo nội dung tích cực.";
    }

    // 5. Model refusal / Error
    if (message.includes("MODEL_ERROR:")) {
        const modelResponse = message.split('MODEL_ERROR: ')[1];
        const modelResponseLower = modelResponse.toLowerCase();

        const refusalKeywords = [
            "cannot fulfill", "i'm sorry", "unable to", "cannot generate", "i cannot",
            "as an ai", "my purpose is to be", "my safety guidelines", "violates my safety policies"
        ];

        // Check if the model is explicitly refusing the request
        if (refusalKeywords.some(keyword => modelResponseLower.includes(keyword))) {
            return "Mô hình AI đã từ chối yêu cầu của bạn. Điều này thường xảy ra khi AI không hiểu rõ yêu cầu hoặc hình ảnh cung cấp không phù hợp.\n\nCách khắc phục:\n- Hãy thử dùng một bức ảnh rõ nét hơn.\n- Đơn giản hóa câu lệnh tùy chỉnh (nếu có).";
        }
        
        // Return the specific model error if it's not a generic refusal
        return `Lỗi từ mô hình AI: ${modelResponse}`;
    }

    // 6. No API Key provided (should be caught by getApiKey)
    if (message.includes("NO_API_KEY")) {
         return "Không tìm thấy API Key. Vui lòng nhập API Key của riêng bạn trong phần Cài đặt để tiếp tục.";
    }
    
    // 7. Network error
    if (message.includes("Failed to fetch")) {
        return "Không thể kết nối đến máy chủ của Google. Vui lòng kiểm tra kết nối mạng của bạn và thử lại.";
    }

    // 8. Fallback for other generic API errors
    // Attempt to parse JSON from the error message which is a common format for API errors.
    try {
        // Find the start of the JSON object
        const jsonStart = message.indexOf('{');
        if (jsonStart !== -1) {
            const jsonString = message.substring(jsonStart);
            const parsedError = JSON.parse(jsonString);
            if(parsedError?.error?.message){
                return `Đã có lỗi xảy ra: ${parsedError.error.message}`;
            }
        }
    } catch (e) {
        // It's not a JSON error, so we'll fall through to the default message
    }

    // 9. Default catch-all for unhandled errors
    console.error("Unhandled API Error:", message); // Log for debugging
    return `Đã xảy ra lỗi không xác định: ${message}. Vui lòng thử lại sau.`;
};


type Mode = 'single' | 'batch';
type BatchResult = { 
  taskId: number;
  imageUrl?: string;
  error?: string;
  status: 'idle' | 'loading' | 'success' | 'error';
};

// Moved the modal component outside of the App component to prevent re-renders from causing focus loss
const ApiKeyModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onSave: (apiKey: string) => Promise<void>;
  onDelete: () => void;
  isVerifying: boolean;
  error: string | null;
  initialApiKey: string;
  hasExistingKey: boolean;
}> = ({ isOpen, onClose, onSave, onDelete, isVerifying, error, initialApiKey, hasExistingKey }) => {
  const [apiKeyInput, setApiKeyInput] = useState(initialApiKey);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setApiKeyInput(initialApiKey);
      setShowDeleteConfirm(false);
    }
  }, [isOpen, initialApiKey]);

  if (!isOpen) return null;

  const handleSaveClick = () => {
    onSave(apiKeyInput);
  };
  
  const handleDeleteConfirmed = () => {
      onDelete();
      onClose(); // Also close modal after deletion
  }

  return (
    <div className="fixed inset-0 z-[101] bg-black bg-opacity-70 flex items-center justify-center animate-fade-in p-4">
      <div className="bg-cream dark:bg-dark-olive p-6 rounded-lg shadow-2xl max-w-md w-full relative">
        {showDeleteConfirm ? (
            <div className="text-center">
                <h3 className="text-lg font-bold mb-4 text-dark-olive dark:text-cream">Xác nhận xóa Key</h3>
                <p className="mb-6 text-dark-olive/80 dark:text-cream/80">Bạn có chắc chắn muốn xóa API Key của mình không? Hành động này sẽ xóa key khỏi trình duyệt.</p>
                <div className="flex justify-center items-center space-x-4">
                    <button onClick={() => setShowDeleteConfirm(false)} className="px-6 py-2 rounded-full text-dark-olive/80 dark:text-cream/80 bg-dark-olive/10 hover:bg-dark-olive/20 dark:bg-olive/20 dark:hover:bg-olive/30 transition-colors font-semibold">
                        Hủy
                    </button>
                    <button 
                        onClick={handleDeleteConfirmed} 
                        className="px-6 py-2 rounded-full bg-red-600 hover:bg-red-700 text-cream font-bold transition-colors"
                    >
                        Xóa Key
                    </button>
                </div>
            </div>
        ) : (
          <>
            <h2 className="text-xl font-bold mb-3 text-dark-olive dark:text-cream">Cài đặt API Key</h2>
            <button onClick={onClose} className="absolute top-3 right-3 text-dark-olive/50 hover:text-dark-olive dark:text-cream/50 dark:hover:text-cream transition-colors">
                <XIcon className="w-6 h-6"/>
            </button>
            <p className="mb-4 text-dark-olive/80 dark:text-cream/80 text-sm">
                Nếu bạn không nhập Key nào, ứng dụng sẽ mặc định sử dụng API Key của tài khoản Google AI Studio bạn đang đăng nhập.
                Khi cần sử dụng không giới hạn hoặc khi Key mặc định hết lượt, bạn có thể nhập Key của riêng mình.
            </p>
            <a href="https://makersuite.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-sm text-olive dark:text-light-olive hover:underline font-semibold mb-1 block">
                Bấm vào đây để nhận API Key miễn phí từ Google
            </a>
             <a href="https://makersuite.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-sm text-olive dark:text-light-olive hover:underline font-semibold mb-4 block">
                Kiểm tra hạn ngạch và quản lý Key tại đây
            </a>
            <input
                type="password"
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                placeholder="Dán API Key của bạn vào đây"
                className={`w-full mt-1 p-3 bg-dark-olive/5 dark:bg-olive/20 border rounded-lg focus:ring-2 transition text-dark-olive dark:text-cream placeholder:text-dark-olive/50 dark:placeholder:text-cream/50 ${error ? 'border-red-500 focus:ring-red-500' : 'border-olive/30 focus:ring-olive focus:border-olive'}`}
            />
            {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
            <div className="mt-5 flex justify-end items-center space-x-3">
                {hasExistingKey && (
                  <button 
                      onClick={() => setShowDeleteConfirm(true)} 
                      className="mr-auto px-5 py-2 rounded-full text-red-500 hover:bg-red-500/10 transition-colors font-semibold"
                  >
                      Xóa Key
                  </button>
                )}
                <button onClick={onClose} className="px-5 py-2 rounded-full text-dark-olive/80 dark:text-cream/80 bg-dark-olive/10 hover:bg-dark-olive/20 dark:bg-olive/20 dark:hover:bg-olive/30 transition-colors font-semibold">
                    Hủy
                </button>
                <button 
                    onClick={handleSaveClick} 
                    className="px-6 py-2 rounded-full bg-olive hover:bg-olive/90 text-cream font-bold transition-colors w-32 text-center"
                    disabled={isVerifying}
                >
                    {isVerifying ? (
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-cream mx-auto"></div>
                    ) : 'Lưu Key'}
                </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};


const App: React.FC = () => {
  const [mode, setMode] = useState<Mode>('single');
  // Single Mode State
  const [images, setImages] = useState<(File | null)[]>([null, null]);
  const [selectedStyleId, setSelectedStyleId] = useState<string | null>(STYLES[0]?.id || null);
  const [customPrompt, setCustomPrompt] = useState('');
  const [isCustomPromptVisible, setCustomPromptVisible] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const progressInterval = useRef<number | null>(null);

  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const enhancementProgressInterval = useRef<number | null>(null);
  const [enhancementProgress, setEnhancementProgress] = useState(0);

  // API Key Management
  const [userApiKey, setUserApiKey] = useState<string | null>(null);
  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState(false);
  const [isVerifyingApiKey, setIsVerifyingApiKey] = useState(false);
  const [apiKeyError, setApiKeyError] = useState<string | null>(null);


  useEffect(() => {
    const savedApiKey = localStorage.getItem('userApiKey');
    if (savedApiKey) {
      setUserApiKey(savedApiKey);
    }
  }, []);

  // Zoomable preview state
  const [zoomState, setZoomState] = useState({ scale: 1, x: 0, y: 0 });
  const imageRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isPinching = useRef(false);
  const isDragging = useRef(false);
  const pinchStartDistance = useRef<number | null>(null);
  const lastPosition = useRef<{ x: number, y: number } | null>(null);

  // Batch Mode State
  const [batchStyleId, setBatchStyleId] = useState<string>(STYLES[0]?.id || '');
  const [batchImages, setBatchImages] = useState<(File | null)[]>([]);
  const [batchResults, setBatchResults] = useState<BatchResult[]>([]);
  const [isBatchLoading, setIsBatchLoading] = useState(false);
  const [batchProgress, setBatchProgress] = useState(0);
  
  useEffect(() => {
    const defaultStyle = STYLES[0]?.id || '';
    setBatchStyleId(defaultStyle);
    if (defaultStyle === 'polaroid') {
      setBatchImages([null, null]);
    } else {
      setBatchImages([null]);
    }
  }, []);

  // Common Functions
  const resetToInitialState = () => {
    setImages([null, null]);
    setSelectedStyleId(STYLES[0]?.id || null);
    setCustomPrompt('');
    setCustomPromptVisible(false);
    setGeneratedImage(null);
    setError(null);
    setIsLoading(false);
    setProgress(0);
    setIsPreviewOpen(false);
    setIsEnhancing(false);
    setEnhancementProgress(0);
  };

  const handleApiError = (err: unknown) => {
    const translatedError = translateApiError(err);
    
    // Check if the site's default key ran out of quota
    const isQuotaError = (err instanceof Error && err.message.includes("RESOURCE_EXHAUSTED"));
    if (isQuotaError && !userApiKey) {
        setError("Rất tiếc, lượt sử dụng miễn phí của trang web đã hết. Vui lòng nhập API Key của riêng bạn trong phần cài đặt để tiếp tục.");
        setIsApiKeyModalOpen(true);
    } else {
        setError(translatedError);
    }
  };
  
  // Single Mode Functions
  const handleImageChange = (file: File | null, index: number) => {
    const newImages = [...images];
    newImages[index] = file;
    setImages(newImages);
  };

  const addImageSlot = () => {
    setImages([...images, null]);
  };

  const removeLastSingleSlot = () => {
    if (images.length > 1) {
      setImages(prev => prev.slice(0, prev.length - 1));
    }
  };

  const removeImage = (index: number) => {
    if (images.length <= 1) {
      setImages([null]);
      return;
    }
    const newImages = images.filter((_, i) => i !== index);
    setImages(newImages);
  };

  const handleGenerate = async () => {
    const imagesToProcess = images.filter((img): img is File => img !== null);
    if (imagesToProcess.length === 0) {
      setError("Vui lòng tải lên ít nhất một ảnh.");
      return;
    }

    const currentPrompt = isCustomPromptVisible
      ? customPrompt
      : STYLES.find(s => s.id === selectedStyleId)?.prompt;

    if (!currentPrompt) {
      setError("Vui lòng chọn một style hoặc nhập lệnh tùy chỉnh.");
      return;
    }

    setIsLoading(true);
    setError(null);
    setGeneratedImage(null);
    setProgress(0);

    let progressValue = 0;
    progressInterval.current = window.setInterval(() => {
        progressValue += Math.random() * 2 + 1;
        if (progressValue >= 95) {
            if(progressInterval.current) clearInterval(progressInterval.current);
            progressValue = 95;
        }
        setProgress(Math.round(progressValue));
    }, 250);

    try {
      const result = await generateTrendImage(imagesToProcess, currentPrompt, userApiKey);
      if(progressInterval.current) clearInterval(progressInterval.current);
      setProgress(100);
      setTimeout(() => {
        setGeneratedImage(result);
        setIsLoading(false);
      }, 500);
    } catch (err) {
      if(progressInterval.current) clearInterval(progressInterval.current);
      handleApiError(err);
      setIsLoading(false);
    }
  };
  
  const handleDownload = useCallback((imageUrl?: string) => {
    const url = imageUrl || generatedImage;
    if (!url) return;
    const link = document.createElement('a');
    link.href = url;
    link.download = `tao-anh-trend-${new Date().getTime()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [generatedImage]);

  const handleDownloadWithAffiliate = useCallback(() => {
    if (!generatedImage) return;
    window.open(AFFILIATE_LINK, '_blank', 'noopener,noreferrer');
    handleDownload();
  }, [generatedImage, handleDownload]);

  const handleUseThisImage = useCallback(async () => {
    if (!generatedImage) return;

    try {
        const imageFile = await dataUrlToFile(generatedImage, 'generated-image.png');
        resetToInitialState();
        setImages([imageFile, null]);
    } catch (e) {
        setError("Không thể sử dụng ảnh này. Vui lòng thử tải về và tải lên lại.");
    }
  }, [generatedImage]);

  const handleEnhance = async (quality: 'HD' | '2K' | '4K') => {
    if (!generatedImage) return;

    setIsEnhancing(true);
    setError(null);
    setEnhancementProgress(0);

    let progressValue = 0;
    const intervalTime = quality === '4K' ? 400 : 300;
    const progressIncrement = quality === '4K' ? 1.5 : 2;

    enhancementProgressInterval.current = window.setInterval(() => {
        progressValue += Math.random() * progressIncrement + 1;
        if (progressValue >= 95) {
            if(enhancementProgressInterval.current) clearInterval(enhancementProgressInterval.current);
            progressValue = 95;
        }
        setEnhancementProgress(Math.round(progressValue));
    }, intervalTime);

    try {
        let result = generatedImage;
        if (quality === '4K') {
            const result1 = await enhanceImage(result, '4K', userApiKey);
            result = await enhanceImage(result1, '4K', userApiKey);
        } else {
            result = await enhanceImage(result, quality, userApiKey);
        }
        
        if(enhancementProgressInterval.current) clearInterval(enhancementProgressInterval.current);
        setEnhancementProgress(100);
        setTimeout(() => {
            setGeneratedImage(result);
            setIsEnhancing(false);
        }, 500);
    } catch (err) {
        if(enhancementProgressInterval.current) clearInterval(enhancementProgressInterval.current);
        handleApiError(err);
        setIsEnhancing(false);
    }
  };

  const handleGoBackToEditing = () => {
    setGeneratedImage(null);
    setError(null);
    setIsEnhancing(false);
    setEnhancementProgress(0);
    if (enhancementProgressInterval.current) {
        clearInterval(enhancementProgressInterval.current);
    }
  };

  const toggleCustomPrompt = () => {
    setCustomPromptVisible(!isCustomPromptVisible);
    if (!isCustomPromptVisible) {
      setSelectedStyleId(null);
    } else if (!selectedStyleId && STYLES.length > 0) {
      setSelectedStyleId(STYLES[0].id);
    }
  };

  const handleStyleSelect = (styleId: string) => {
    setSelectedStyleId(styleId);
    if(isCustomPromptVisible) {
      setCustomPromptVisible(false);
    }
  };

  // Batch Mode Functions
  const handleBatchStyleChange = (styleId: string) => {
    setBatchStyleId(styleId);
    setBatchResults([]);
  
    setBatchImages(prev => {
      const hasUploadedFiles = prev.some(img => img !== null);
      if (!hasUploadedFiles) {
        return styleId === 'polaroid' ? [null, null] : [null];
      }
  
      const currentImages = [...prev];
  
      if (styleId === 'polaroid' && currentImages.length % 2 !== 0) {
        currentImages.push(null);
      }
      
      return currentImages;
    });
  };

  const addBatchSlot = () => {
    if (batchStyleId === 'polaroid') {
        setBatchImages(prev => [...prev, null, null]);
    } else {
        setBatchImages(prev => [...prev, null]);
    }
  };

  const removeLastBatchSlot = () => {
    if (batchStyleId === 'polaroid') {
        if (batchImages.length > 2) {
            setBatchImages(prev => prev.slice(0, prev.length - 2));
        }
    } else {
        if (batchImages.length > 1) {
            setBatchImages(prev => prev.slice(0, prev.length - 1));
        }
    }
  };
  
  const handleBatchImageChange = (index: number, file: File | null) => {
    setBatchImages(prev => prev.map((img, idx) => idx === index ? file : img));
  };
  
  const removeBatchImage = (index: number) => {
    if (batchImages.length <= 1) {
        setBatchImages([null]);
        return;
    }
    setBatchImages(prev => prev.filter((_, i) => i !== index));
  };

  const removePolaroidPair = (pairIndex: number) => {
      if (batchImages.length <= 2) {
          setBatchImages([null, null]);
          return;
      }
      const startIndex = pairIndex * 2;
      setBatchImages(prev => prev.filter((_, i) => i < startIndex || i >= startIndex + 2));
  }

  const handleBatchGenerate = async () => {
    const currentPrompt = STYLES.find(s => s.id === batchStyleId)?.prompt;
    if (!currentPrompt) {
        setError("Vui lòng chọn một style hợp lệ.");
        return;
    }

    const validTasksWithIds: { taskId: number, images: File[] }[] = [];
    if (batchStyleId === 'polaroid') {
        for (let i = 0; i < batchImages.length / 2; i++) {
            const image1 = batchImages[i*2];
            const image2 = batchImages[i*2 + 1];
            if (image1 && image2) {
                validTasksWithIds.push({ taskId: i, images: [image1, image2] });
            }
        }
    } else {
        batchImages.forEach((img, index) => {
            if (img) {
                validTasksWithIds.push({ taskId: index, images: [img] });
            }
        });
    }

    if (validTasksWithIds.length === 0) {
        setError("Vui lòng hoàn thành ít nhất một bộ ảnh để tạo.");
        return;
    }

    setIsBatchLoading(true);
    setError(null);
    setBatchResults(validTasksWithIds.map(task => ({ taskId: task.taskId, status: 'loading' })));
    setBatchProgress(0);

    for (let i = 0; i < validTasksWithIds.length; i++) {
        const task = validTasksWithIds[i];
        try {
            if (i > 0) await new Promise(resolve => setTimeout(resolve, 300));

            const imageUrl = await generateTrendImage(task.images, currentPrompt, userApiKey);

            setBatchResults(prev => prev.map(r => 
                r.taskId === task.taskId ? { ...r, status: 'success', imageUrl } : r
            ));
        } catch (err) {
            const errorMessage = translateApiError(err);
            const isQuotaError = (err instanceof Error && err.message.includes("RESOURCE_EXHAUSTED"));
            
            if (isQuotaError && !userApiKey) {
                setError("Lượt sử dụng của trang đã hết. Vui lòng nhập API Key của bạn để tiếp tục.");
                setIsApiKeyModalOpen(true);
                setIsBatchLoading(false);
                setBatchResults([]); // Clear results on quota error
                return; // Stop the whole batch process
            }

            setBatchResults(prev => prev.map(r => 
                r.taskId === task.taskId ? { ...r, status: 'error', error: errorMessage } : r
            ));
        }
        setBatchProgress(Math.round(((i + 1) / validTasksWithIds.length) * 100));
    }
    
    setIsBatchLoading(false);
  };
  
  const resetBatchState = () => {
    handleBatchStyleChange(batchStyleId);
  }

  const handleGoBackToBatchEditing = () => {
    setBatchResults([]);
  };

  const openBatchImagePreview = (imageUrl: string) => {
    setGeneratedImage(imageUrl);
    openPreview();
  };

  const handleDownloadAll = () => {
      const successfulImages = batchResults
          .filter(r => r.status === 'success' && r.imageUrl)
          .map(r => r.imageUrl!);

      if(successfulImages.length === 0) {
        alert("Không có ảnh nào để tải về.");
        return;
      }

      successfulImages.forEach((url, index) => {
          setTimeout(() => {
              handleDownload(url);
          }, index * 300);
      });
  };

  const handleDownloadAllWithAffiliate = () => {
    window.open(AFFILIATE_LINK, '_blank', 'noopener,noreferrer');
    handleDownloadAll();
  };


  // Zoom/Pan Preview Modal Logic
  const resetZoom = useCallback(() => {
    setZoomState({ scale: 1, x: 0, y: 0 });
    isPinching.current = false;
    isDragging.current = false;
    pinchStartDistance.current = null;
    lastPosition.current = null;
  }, []);

  const openPreview = useCallback(() => {
    resetZoom();
    setIsPreviewOpen(true);
  }, [resetZoom]);

  const closePreview = useCallback(() => {
    setIsPreviewOpen(false);
  }, []);

  const applyZoomBoundaries = (state: { scale: number; x: number; y: number }) => {
    const { scale, x, y } = state;

    if (scale <= 1) {
      return { scale: 1, x: 0, y: 0 };
    }

    const image = imageRef.current;
    const container = containerRef.current;
    if (!image || !container) return state;

    const containerRect = container.getBoundingClientRect();
    const imageWidth = image.clientWidth * scale;
    const imageHeight = image.clientHeight * scale;

    const xBound = Math.max(0, (imageWidth - containerRect.width) / 2);
    const yBound = Math.max(0, (imageHeight - containerRect.height) / 2);

    return {
      scale,
      x: clamp(x, -xBound, xBound),
      y: clamp(y, -yBound, yBound),
    };
  };
  
  const getDistance = (touches: React.TouchList | TouchList): number => {
    const [touch1, touch2] = [touches[0], touches[1]];
    return Math.sqrt(Math.pow(touch2.clientX - touch1.clientX, 2) + Math.pow(touch2.clientY - touch1.clientY, 2));
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2) {
      isPinching.current = true;
      isDragging.current = false;
      pinchStartDistance.current = getDistance(e.touches);
    } else if (e.touches.length === 1) {
      isDragging.current = true;
      isPinching.current = false;
      lastPosition.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (isPinching.current && e.touches.length === 2 && pinchStartDistance.current) {
      e.preventDefault();
      const newDistance = getDistance(e.touches);
      const scale = zoomState.scale * (newDistance / pinchStartDistance.current);
      pinchStartDistance.current = newDistance;
      
      setZoomState(prev => applyZoomBoundaries({ ...prev, scale }));

    } else if (isDragging.current && e.touches.length === 1 && lastPosition.current && zoomState.scale > 1) {
      e.preventDefault();
      const dx = e.touches[0].clientX - lastPosition.current.x;
      const dy = e.touches[0].clientY - lastPosition.current.y;
      lastPosition.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };

      setZoomState(prev => applyZoomBoundaries({ ...prev, x: prev.x + dx, y: prev.y + dy }));
    }
  };

  const handleTouchEnd = () => {
    isPinching.current = false;
    isDragging.current = false;
    pinchStartDistance.current = null;
    lastPosition.current = null;
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const scaleAmount = -e.deltaY * 0.005;
    setZoomState(prev => applyZoomBoundaries({ ...prev, scale: prev.scale + scaleAmount }));
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (zoomState.scale > 1) {
        e.preventDefault();
        isDragging.current = true;
        lastPosition.current = { x: e.clientX, y: e.clientY };
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isDragging.current && lastPosition.current && e.buttons === 1) {
        e.preventDefault();
        const dx = e.clientX - lastPosition.current.x;
        const dy = e.clientY - lastPosition.current.y;
        lastPosition.current = { x: e.clientX, y: e.clientY };
        setZoomState(prev => applyZoomBoundaries({
            ...prev,
            x: prev.x + dx,
            y: prev.y + dy,
        }));
    } else if (isDragging.current && e.buttons !== 1) {
      isDragging.current = false;
      lastPosition.current = null;
    }
  };

  const handleMouseUp = () => {
    isDragging.current = false;
    lastPosition.current = null;
  };
  
  const handleSaveApiKey = async (apiKeyToValidate: string) => {
    setIsVerifyingApiKey(true);
    setApiKeyError(null);
    const result = await validateApiKey(apiKeyToValidate);

    if (result.success) {
      localStorage.setItem('userApiKey', apiKeyToValidate);
      setUserApiKey(apiKeyToValidate);
      setError(null); // Clear main application error
      setIsApiKeyModalOpen(false);
      setIsVerifyingApiKey(false);
    } else {
      setIsVerifyingApiKey(false);
      setApiKeyError(translateApiError(new Error(result.error || 'API Key không hợp lệ.')));
    }
  };

  const handleDeleteApiKey = () => {
    localStorage.removeItem('userApiKey');
    setUserApiKey(null);
    setApiKeyError(null);
    setError(null); // Clear main application error as well
  };

  const handleOpenApiKeyModal = () => {
    setApiKeyError(null);
    setIsApiKeyModalOpen(true);
  }

  const LoadingState = () => (
    <div className="flex flex-col items-center justify-center space-y-4 w-full max-w-md">
        <p className="text-olive dark:text-light-olive text-lg">Đang tạo ảnh, vui lòng chờ...</p>
        <div className="w-full bg-dark-olive/10 dark:bg-cream/10 rounded-full h-4">
            <div
                className="bg-olive h-4 rounded-full transition-all duration-300 ease-linear"
                style={{ width: `${progress}%` }}
            ></div>
        </div>
        <p className="text-2xl font-bold text-dark-olive dark:text-cream">{progress}%</p>
        <p className="text-dark-olive/70 dark:text-cream/70 text-center text-sm mt-2">Quá trình này có thể mất một chút thời gian. Cảm ơn bạn đã kiên nhẫn!</p>
    </div>
  );

  const Tabs = () => (
    <div className="flex justify-center mb-8">
      <div className="flex p-1 bg-dark-olive/10 dark:bg-olive/20 rounded-full">
        <button 
          onClick={() => setMode('single')}
          className={`px-6 py-2 rounded-full transition-colors duration-300 ${mode === 'single' ? 'bg-olive text-cream shadow' : 'text-dark-olive/70 dark:text-cream/70 hover:bg-dark-olive/5 dark:hover:bg-olive/10'}`}
        >
          Tạo ảnh đơn
        </button>
        <button 
          onClick={() => setMode('batch')}
          className={`px-6 py-2 rounded-full transition-colors duration-300 ${mode === 'batch' ? 'bg-olive text-cream shadow' : 'text-dark-olive/70 dark:text-cream/70 hover:bg-dark-olive/5 dark:hover:bg-olive/10'}`}
        >
          Tạo hàng loạt
        </button>
      </div>
    </div>
  );
  
  const primaryButtonClasses = "w-full max-w-xs bg-gradient-to-r from-olive to-light-olive text-cream font-bold py-3 px-8 rounded-full shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed";
  const secondaryButtonClasses = "w-full max-w-xs bg-dark-olive/10 dark:bg-olive/20 hover:bg-dark-olive/20 dark:hover:bg-olive/30 font-semibold py-3 px-6 rounded-full shadow-md hover:shadow-lg transform hover:scale-105 transition-all duration-300 disabled:opacity-50";

  const ApiKeyStatus = () => (
      <p className="text-dark-olive/60 dark:text-cream/60 mt-2 text-xs font-semibold">
        {userApiKey ? 'Đang sử dụng Key cá nhân của bạn' : 'Đang sử dụng Key mặc định của AI Studio'}
      </p>
  );

  return (
    <div className="min-h-screen text-dark-olive dark:text-cream flex flex-col items-center p-4 sm:p-6 lg:p-8">
      <div className="fixed top-4 left-4 z-50 flex space-x-2 items-center">
        <ThemeSwitcher />
        <button
          onClick={handleOpenApiKeyModal}
          className="relative p-2 rounded-full bg-olive/20 dark:bg-cream/20 text-dark-olive dark:text-cream hover:bg-olive/30 dark:hover:bg-cream/30 transition-colors"
          aria-label="Cài đặt API Key"
        >
            <GearIcon className="w-6 h-6" />
            {userApiKey && (
              <span className="absolute top-0 right-0 block h-3 w-3 rounded-full bg-green-500 ring-2 ring-cream dark:ring-dark-olive" title="API Key cá nhân đang hoạt động"></span>
            )}
        </button>
      </div>
      
      <main className="w-full max-w-2xl mx-auto">
        <header className="text-center my-8">
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-olive to-dark-olive dark:from-light-olive dark:to-cream">
            TẠO ẢNH TREND
          </h1>
        </header>

        <Tabs />

        {/* SINGLE MODE UI */}
        {mode === 'single' && (
          <>
            {!generatedImage && !isLoading && (
              <div className="space-y-8 animate-fade-in">
                <div>
                  <h2 className="text-lg font-semibold text-dark-olive/90 dark:text-cream/90 mb-3 text-center">Tải ảnh lên</h2>
                  <div className="flex flex-wrap justify-center items-start gap-4">
                      {images.map((imageFile, index) => (
                          <ImageUploader
                              key={index}
                              label={`Ảnh ${index + 1}`}
                              onImageChange={(file) => handleImageChange(file, index)}
                              onRemove={() => removeImage(index)}
                              initialFile={imageFile}
                          />
                      ))}
                  </div>
                </div>
                
                <div className="flex justify-center items-center gap-4">
                    <button
                        onClick={removeLastSingleSlot}
                        className="py-2 px-6 flex justify-center items-center bg-dark-olive/10 dark:bg-olive/20 rounded-full cursor-pointer hover:bg-dark-olive/20 dark:hover:bg-olive/30 transition-colors duration-300 text-dark-olive dark:text-cream disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-dark-olive/10 dark:disabled:hover:bg-olive/20"
                        aria-label="Bớt ô tải ảnh"
                        disabled={images.length <= 1}
                    >
                        <MinusIcon className="w-6 h-6" />
                    </button>
                    <button
                        onClick={addImageSlot}
                        className="py-2 px-6 flex justify-center items-center bg-dark-olive/10 dark:bg-olive/20 rounded-full cursor-pointer hover:bg-dark-olive/20 dark:hover:bg-olive/30 transition-colors duration-300 text-dark-olive dark:text-cream"
                        aria-label="Thêm ảnh"
                    >
                        <PlusIcon className="w-6 h-6" />
                    </button>
                </div>

                <div>
                  <h2 className="text-lg font-semibold text-dark-olive/90 dark:text-cream/90 mb-3">Chọn style</h2>
                  <div className="grid grid-cols-2 gap-3">
                    {STYLES.map((style: Style) => (
                      <button
                        key={style.id}
                        onClick={() => handleStyleSelect(style.id)}
                        className={`p-4 rounded-lg text-left transition-all duration-200 ${selectedStyleId === style.id ? 'bg-olive text-cream ring-2 ring-olive/70' : 'bg-dark-olive/5 dark:bg-olive/20 hover:bg-dark-olive/10 dark:hover:bg-olive/30'}`}
                      >
                        <span className="font-bold">{style.name}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="w-full">
                    <button onClick={toggleCustomPrompt} className={`w-full flex justify-center items-center space-x-2 p-3 rounded-lg transition-colors duration-300 ${isCustomPromptVisible ? 'bg-olive text-cream ring-2 ring-olive/70' : 'bg-dark-olive/10 dark:bg-olive/20 hover:bg-dark-olive/20 dark:hover:bg-olive/30'}`}>
                        <PlusIcon className={`w-5 h-5 transition-transform duration-300 ${isCustomPromptVisible ? 'rotate-45' : ''}`}/>
                        <span>Lệnh tùy chỉnh</span>
                    </button>
                    {isCustomPromptVisible && (
                        <textarea
                            value={customPrompt}
                            onChange={(e) => setCustomPrompt(e.target.value)}
                            placeholder="Nhập prompt (câu lệnh) của bạn vào đây..."
                            className="w-full mt-3 p-3 bg-dark-olive/5 dark:bg-olive/20 border border-olive/30 rounded-lg focus:ring-2 focus:ring-olive focus:border-olive transition animate-fade-in text-dark-olive dark:text-cream placeholder:text-dark-olive/50 dark:placeholder:text-cream/50"
                            rows={4}
                        />
                    )}
                </div>

                <div className="text-center mt-8">
                  <button
                    onClick={handleGenerate}
                    disabled={isLoading}
                    className={primaryButtonClasses}
                  >
                    Tạo Ảnh Ngay
                  </button>
                  <ApiKeyStatus />
                </div>
              </div>
            )}

            {isLoading && <LoadingState />}

            {generatedImage && !isLoading && (
              <div className="mt-8 text-center animate-fade-in">
                <h2 className="text-2xl font-bold mb-4">Kết quả của bạn!</h2>
                <div className="relative inline-block">
                  <img
                    src={generatedImage}
                    alt="Generated Trend"
                    className="rounded-lg shadow-2xl mx-auto cursor-pointer max-w-full"
                    onClick={openPreview}
                  />
                  {isEnhancing && (
                    <div className="absolute inset-0 bg-black bg-opacity-75 flex flex-col items-center justify-center rounded-lg pointer-events-none">
                        <div className="relative w-24 h-24">
                            <svg className="w-full h-full" viewBox="0 0 100 100">
                                <circle className="text-dark-olive/20 dark:text-cream/20" strokeWidth="10" stroke="currentColor" fill="transparent" r="45" cx="50" cy="50" />
                                <circle
                                    className="text-olive dark:text-light-olive"
                                    strokeWidth="10"
                                    strokeDasharray={2 * Math.PI * 45}
                                    strokeDashoffset={2 * Math.PI * 45 * (1 - enhancementProgress / 100)}
                                    strokeLinecap="round"
                                    stroke="currentColor"
                                    fill="transparent"
                                    r="45"
                                    cx="50"
                                    cy="50"
                                    style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%', transition: 'stroke-dashoffset 0.3s ease' }}
                                />
                            </svg>
                            <span className="absolute inset-0 flex items-center justify-center text-xl font-bold text-cream">
                                {enhancementProgress}%
                            </span>
                        </div>
                        <p className="text-cream mt-4 font-semibold">Đang nâng cấp ảnh...</p>
                    </div>
                  )}
                </div>
                
                <div className="mt-6 flex flex-col items-center space-y-3">
                  {!isEnhancing && (
                    <div className="w-full max-w-xs p-4 bg-dark-olive/5 dark:bg-olive/20 rounded-lg">
                        <h3 className="text-md font-semibold text-dark-olive/90 dark:text-cream/90 mb-3">Nâng cấp chất lượng ảnh</h3>
                        <div className="flex justify-center gap-2">
                            <button onClick={() => handleEnhance('HD')} className="bg-transparent border border-olive/50 text-olive hover:bg-olive hover:text-cream font-semibold py-2 px-3 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed" disabled={isEnhancing}>HD</button>
                            <button onClick={() => handleEnhance('2K')} className="bg-transparent border border-olive/50 text-olive hover:bg-olive hover:text-cream font-semibold py-2 px-3 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed" disabled={isEnhancing}>2K</button>
                            <button onClick={() => handleEnhance('4K')} className="bg-transparent border border-olive/50 text-olive hover:bg-olive hover:text-cream font-semibold py-2 px-3 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed" disabled={isEnhancing}>4K (x2)</button>
                        </div>
                    </div>
                  )}

                  <div className="flex items-center space-x-2 w-full max-w-xs">
                        <button
                            onClick={handleDownloadWithAffiliate}
                            className={`flex-grow ${primaryButtonClasses}`}
                            disabled={isEnhancing}
                        >
                            Tải Về
                        </button>
                        <button
                            onClick={() => handleDownload()}
                            className="p-3 bg-olive/80 hover:bg-olive text-cream rounded-full shadow-lg transform hover:scale-105 transition-all duration-300 disabled:opacity-50"
                            aria-label="Tải ảnh về"
                            disabled={isEnhancing}
                        >
                            <DownloadIcon className="w-6 h-6" />
                        </button>
                    </div>
                  <button
                    onClick={handleUseThisImage}
                    className={secondaryButtonClasses}
                    disabled={isEnhancing}
                  >
                    Dùng ảnh này tạo tiếp
                  </button>
                  <button
                    onClick={handleGoBackToEditing}
                    className={secondaryButtonClasses}
                    disabled={isEnhancing}
                  >
                    Quay lại
                  </button>
                  <button
                    onClick={resetToInitialState}
                    className={secondaryButtonClasses}
                    disabled={isEnhancing}
                  >
                    Tạo ảnh khác
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {/* BATCH MODE UI */}
        {mode === 'batch' && (
          <div className="w-full animate-fade-in">
            {batchResults.length === 0 && !isBatchLoading && (
              <div className="space-y-8">
                <div>
                  <h2 className="text-lg font-semibold text-dark-olive/90 dark:text-cream/90 mb-3">Chọn style hàng loạt</h2>
                  <div className="grid grid-cols-2 gap-3">
                    {STYLES.map((style) => (
                      <button
                        key={style.id}
                        onClick={() => handleBatchStyleChange(style.id)}
                        className={`p-4 rounded-lg text-left transition-all duration-200 ${batchStyleId === style.id ? 'bg-olive text-cream ring-2 ring-olive/70' : 'bg-dark-olive/5 dark:bg-olive/20 hover:bg-dark-olive/10 dark:hover:bg-olive/30'}`}
                      >
                        <span className="font-bold">{style.name}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <h2 className="text-lg font-semibold text-dark-olive/90 dark:text-cream/90 mb-3 text-center">Tải ảnh lên theo từng bộ</h2>
                  {batchStyleId === 'polaroid' ? (
                    <div className="space-y-4">
                      {Array.from({ length: batchImages.length / 2 }).map((_, pairIndex) => (
                        <div key={pairIndex} className="flex items-center justify-center gap-4 p-3 bg-dark-olive/5 dark:bg-olive/20 rounded-lg relative pt-8">
                           <div className="absolute top-2 left-3 flex items-center">
                            <span className="font-bold text-olive dark:text-light-olive">Bộ {pairIndex + 1}</span>
                           </div>
                           <button onClick={() => removePolaroidPair(pairIndex)} className="absolute top-1 right-1 bg-dark-olive/10 rounded-full p-1 text-dark-olive/60 hover:bg-dark-olive/20 hover:text-dark-olive dark:text-cream/60 dark:hover:text-cream dark:hover:bg-olive/30 transition-colors" aria-label={`Xóa bộ ${pairIndex + 1}`}>
                                <XIcon className="w-4 h-4" />
                            </button>
                          <ImageUploader
                            label={`Ảnh 1`}
                            initialFile={batchImages[pairIndex * 2]}
                            onImageChange={(file) => handleBatchImageChange(pairIndex * 2, file)}
                            onRemove={() => handleBatchImageChange(pairIndex * 2, null)}
                          />
                          <ImageUploader
                            label={`Ảnh 2`}
                            initialFile={batchImages[pairIndex * 2 + 1]}
                            onImageChange={(file) => handleBatchImageChange(pairIndex * 2 + 1, file)}
                            onRemove={() => handleBatchImageChange(pairIndex * 2 + 1, null)}
                          />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                      {batchImages.map((imageFile, index) => (
                        <ImageUploader
                          key={index}
                          label={`Ảnh ${index + 1}`}
                          initialFile={imageFile}
                          onImageChange={(file) => handleBatchImageChange(index, file)}
                          onRemove={() => removeBatchImage(index)}
                        />
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex justify-center items-center gap-4">
                  <button
                    onClick={removeLastBatchSlot}
                    className="py-2 px-6 flex justify-center items-center bg-dark-olive/10 dark:bg-olive/20 rounded-full cursor-pointer hover:bg-dark-olive/20 dark:hover:bg-olive/30 transition-colors duration-300 text-dark-olive dark:text-cream disabled:opacity-50 disabled:cursor-not-allowed"
                    aria-label="Bớt ô tải ảnh"
                    disabled={batchImages.length <= (batchStyleId === 'polaroid' ? 2 : 1)}
                  >
                    <MinusIcon className="w-6 h-6" />
                  </button>
                  <button
                    onClick={addBatchSlot}
                    className="py-2 px-6 flex justify-center items-center bg-dark-olive/10 dark:bg-olive/20 rounded-full cursor-pointer hover:bg-dark-olive/20 dark:hover:bg-olive/30 transition-colors duration-300 text-dark-olive dark:text-cream"
                    aria-label="Thêm ô tải ảnh"
                  >
                    <PlusIcon className="w-6 h-6" />
                  </button>
                </div>

                <div className="text-center mt-8">
                  <button
                    onClick={handleBatchGenerate}
                    disabled={isBatchLoading}
                    className={primaryButtonClasses}
                  >
                    Tạo Hàng Loạt
                  </button>
                  <ApiKeyStatus />
                </div>
              </div>
            )}
            
            {isBatchLoading && (
              <div className="flex flex-col items-center justify-center space-y-4 w-full max-w-md">
                <p className="text-olive dark:text-light-olive text-lg">Đang xử lý hàng loạt...</p>
                <div className="w-full bg-dark-olive/10 dark:bg-cream/10 rounded-full h-4">
                  <div
                    className="bg-olive h-4 rounded-full transition-all duration-300 ease-linear"
                    style={{ width: `${batchProgress}%` }}
                  ></div>
                </div>
                <p className="text-2xl font-bold text-dark-olive dark:text-cream">{batchProgress}%</p>
                <p className="text-dark-olive/70 dark:text-cream/70 text-center text-sm mt-2">Quá trình này có thể mất nhiều thời gian hơn tùy thuộc vào số lượng ảnh.</p>
              </div>
            )}
            
            {batchResults.length > 0 && !isBatchLoading && (
              <div className="space-y-6 animate-fade-in">
                <h2 className="text-2xl font-bold text-center">Kết quả hàng loạt</h2>
                <div className="grid grid-cols-2 gap-4">
                  {batchResults.map((result) => (
                    <div key={result.taskId} className="relative rounded-lg overflow-hidden shadow-lg aspect-square">
                      {result.status === 'success' && result.imageUrl ? (
                        <>
                          <img 
                            src={result.imageUrl} 
                            alt={`Kết quả ${result.taskId + 1}`} 
                            className="w-full h-full object-cover cursor-pointer"
                            onClick={() => openBatchImagePreview(result.imageUrl!)}
                          />
                          <div className="absolute top-1 right-1 flex items-center gap-1">
                              <button
                                onClick={() => handleDownload(result.imageUrl)}
                                className="p-1.5 bg-dark-olive/60 hover:bg-dark-olive/80 text-cream rounded-full transition-colors"
                                aria-label="Tải ảnh"
                              >
                                <DownloadIcon className="w-4 h-4" />
                              </button>
                          </div>
                        </>
                      ) : result.status === 'error' ? (
                        <div className="w-full h-full bg-red-900/20 flex flex-col items-center justify-center p-2 text-center">
                          <p className="text-red-400 font-bold text-sm">Lỗi</p>
                          <p className="text-red-400/80 text-xs mt-1">{result.error}</p>
                        </div>
                      ) : ( 
                        <div className="w-full h-full bg-dark-olive/10 dark:bg-olive/20 flex items-center justify-center">
                          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-olive dark:border-light-olive"></div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <div className="flex flex-col items-center space-y-3">
                  <div className="flex items-center space-x-2 w-full max-w-xs">
                      <button onClick={handleDownloadAllWithAffiliate} className={`flex-grow ${primaryButtonClasses}`}>
                        Tải Tất Cả
                      </button>
                       <button
                            onClick={() => handleDownloadAll()}
                            className="p-3 bg-olive/80 hover:bg-olive text-cream rounded-full shadow-lg transform hover:scale-105 transition-all duration-300"
                            aria-label="Tải tất cả ảnh về"
                        >
                            <DownloadIcon className="w-6 h-6" />
                        </button>
                  </div>
                  <button onClick={handleGoBackToBatchEditing} className={secondaryButtonClasses}>
                    Quay lại
                  </button>
                   <button onClick={resetBatchState} className={secondaryButtonClasses}>
                    Tạo lô khác
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {error && !isLoading && !isBatchLoading && (
            <div className="mt-8 text-center p-4 bg-red-900/20 rounded-lg animate-fade-in">
                <p className="text-red-400 font-semibold mb-2">Đã xảy ra lỗi</p>
                <p className="text-red-400/80 whitespace-pre-line">{error}</p>
                <button
                    onClick={() => setError(null)}
                    className="mt-4 bg-dark-olive/10 dark:bg-olive/20 hover:bg-dark-olive/20 dark:hover:bg-olive/30 font-bold py-2 px-6 rounded-full"
                >
                    OK
                </button>
            </div>
        )}
      </main>

      <Footer />

      <ApiKeyModal
        isOpen={isApiKeyModalOpen}
        onClose={() => setIsApiKeyModalOpen(false)}
        onSave={handleSaveApiKey}
        onDelete={handleDeleteApiKey}
        isVerifying={isVerifyingApiKey}
        error={apiKeyError}
        initialApiKey={userApiKey || ''}
        hasExistingKey={!!userApiKey}
      />

      {isPreviewOpen && (
        <div className="fixed inset-0 z-[100] bg-black bg-opacity-90 flex flex-col items-center justify-center animate-fade-in" onClick={closePreview}>
          <div
            ref={containerRef}
            className="relative w-full h-full flex items-center justify-center overflow-hidden"
            onClick={(e) => e.stopPropagation()}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            <img
              ref={imageRef}
              src={generatedImage!}
              alt="Preview"
              className="max-w-full max-h-full object-contain transition-transform duration-100"
              style={{ transform: `translate(${zoomState.x}px, ${zoomState.y}px) scale(${zoomState.scale})` }}
              draggable="false"
            />
          </div>
          <div className="absolute top-4 right-4 flex space-x-2 z-10">
             <button
                onClick={resetZoom}
                className="p-2 bg-white/20 hover:bg-white/30 text-white rounded-full transition-colors"
                aria-label="Reset zoom"
              >
                <PlusIcon className="w-6 h-6 rotate-45" />
            </button>
            <button
              onClick={() => handleDownload()}
              className="p-2 bg-white/20 hover:bg-white/30 text-white rounded-full transition-colors"
              aria-label="Download image"
            >
              <DownloadIcon className="w-6 h-6" />
            </button>
            <button
              onClick={closePreview}
              className="p-2 bg-white/20 hover:bg-white/30 text-white rounded-full transition-colors"
              aria-label="Close preview"
            >
              <XIcon className="w-6 h-6" />
            </button>
          </div>
        </div>
      )}

    </div>
  );
};

export default App;
