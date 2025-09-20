import { GoogleGenAI, Modality } from "@google/genai";

const fileToGenerativePart = async (file: File) => {
  const base64EncodedDataPromise = new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result.split(',')[1]);
      } else {
        reject(new Error('Failed to read file as data URL.'));
      }
    };
    reader.onerror = (error) => reject(error);
    reader.readAsDataURL(file);
  });
  
  const data = await base64EncodedDataPromise;
  return {
    inlineData: {
      data,
      mimeType: file.type,
    },
  };
};

const dataUrlToGenerativePart = async (dataUrl: string) => {
  const base64Data = dataUrl.split(',')[1];
  const mimeType = dataUrl.match(/:(.*?);/)?.[1] ?? 'image/png';
  return {
    inlineData: {
      data: base64Data,
      mimeType: mimeType,
    },
  };
};

const getApiKey = (userApiKey?: string | null): string => {
    // Ưu tiên key do người dùng cung cấp trong cài đặt.
    if (userApiKey && userApiKey.trim() !== '') {
        return userApiKey;
    }
    // Nếu không, sử dụng key mặc định được cung cấp bởi môi trường AI Studio.
    const studioKey = (typeof process !== 'undefined' && process.env) ? process.env.API_KEY : undefined;
    if (studioKey) {
        return studioKey;
    }
    // Nếu cả hai đều không có, báo lỗi.
    throw new Error("NO_API_KEY");
}

export const validateApiKey = async (apiKey: string): Promise<{ success: boolean; error?: string }> => {
    if (!apiKey) {
        return { success: false, error: "API Key không được để trống." };
    }
    try {
        const ai = new GoogleGenAI({ apiKey });
        // Perform a lightweight, low-cost operation to validate the key
        await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: 'test',
        });
        return { success: true };
    } catch (error) {
        if (error instanceof Error) {
            return { success: false, error: error.message };
        }
        return { success: false, error: "Lỗi không xác định khi xác thực Key." };
    }
};


export const generateTrendImage = async (images: File[], prompt: string, userApiKey?: string | null): Promise<string> => {
  const apiKey = getApiKey(userApiKey);
  const ai = new GoogleGenAI({ apiKey });

  const imageParts = await Promise.all(images.map(fileToGenerativePart));
  const textPart = { text: prompt };

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image-preview',
      contents: {
        parts: [...imageParts, textPart],
      },
      config: {
        responseModalities: [Modality.IMAGE, Modality.TEXT],
      },
    });

    if (response.candidates?.[0]?.finishReason === 'SAFETY') {
        throw new Error('SAFETY');
    }

    const imagePart = response.candidates?.[0]?.content?.parts?.find(part => part.inlineData);

    if (imagePart && imagePart.inlineData) {
      return `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`;
    }
    
    // Pass the model's text response in the error for better debugging
    const textResponse = response.text || 'Không nhận được phản hồi hợp lệ từ mô hình.';
    throw new Error(`MODEL_ERROR: ${textResponse}`);
  } catch (error) {
    // Re-throw the error to be handled by the UI component
    throw error;
  }
};

export const enhanceImage = async (imageDataUrl: string, quality: 'HD' | '2K' | '4K', userApiKey?: string | null): Promise<string> => {
  const apiKey = getApiKey(userApiKey);
  const ai = new GoogleGenAI({ apiKey });

  const imagePart = await dataUrlToGenerativePart(imageDataUrl);
  
  const promptText = `Hoạt động như một công cụ phục hồi và nâng cấp ảnh chuyên nghiệp. Nâng cấp hình ảnh này lên độ phân giải ${quality} bằng các thuật toán siêu phân giải. Làm sắc nét các chi tiết, loại bỏ nhiễu và các tạo tác, đồng thời cải thiện độ rõ nét tổng thể mà không làm thay đổi bố cục hoặc chủ thể ban đầu. Hình ảnh cuối cùng phải rõ ràng và chi tiết hơn đáng kể.`;

  const textPart = { text: promptText };

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image-preview',
      contents: {
        parts: [imagePart, textPart],
      },
      config: {
        responseModalities: [Modality.IMAGE, Modality.TEXT],
      },
    });

    if (response.candidates?.[0]?.finishReason === 'SAFETY') {
        throw new Error('SAFETY');
    }

    const newImagePart = response.candidates?.[0]?.content?.parts?.find(part => part.inlineData);

    if (newImagePart && newImagePart.inlineData) {
      return `data:${newImagePart.inlineData.mimeType};base64,${newImagePart.inlineData.data}`;
    }

    const textResponse = response.text || 'Không nhận được phản hồi hợp lệ từ mô hình.';
    throw new Error(`MODEL_ERROR: ${textResponse}`);
  } catch (error) {
    // Re-throw the error to be handled by the UI component
    throw error;
  }
};