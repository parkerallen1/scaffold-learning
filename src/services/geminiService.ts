import { GoogleGenAI, Modality, Type } from "@google/genai";
import { Question } from '../types';

// Helper function to decode base64 string to Uint8Array
function decode(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

// Helper function to decode raw PCM audio data into an AudioBuffer
async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}


export const speak = async (text: string): Promise<void> => {
  if (!process.env.API_KEY) {
    throw new Error("API_KEY environment variable not set.");
  }

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-preview-tts",
    contents: [{ parts: [{ text }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: 'Kore' },
        },
      },
    },
  });

  const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

  if (base64Audio) {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    const audioBytes = decode(base64Audio);
    const audioBuffer = await decodeAudioData(audioBytes, audioContext, 24000, 1);
    
    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioContext.destination);
    source.start();
  } else {
    throw new Error("No audio data received from API.");
  }
};

export const generateQuestionsFromImage = async (fileData: string, mimeType: string): Promise<Question[]> => {
  if (!process.env.API_KEY) {
    throw new Error("API_KEY environment variable not set.");
  }

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  const prompt = `
    Analyze the provided document (image or PDF).
    Extract all the questions and their corresponding answers.
    Format the output as a valid JSON array. Each object in the array should represent a single question and must conform to the provided schema.
    - Each question must have a unique 'id', starting from 1 and incrementing for each question.
    - The 'question' field should contain the full text of the question.
    - The 'answer' field should contain the correct answer.
    - If a question involves a table, populate the 'data' field. 'type' should be 'table', 'headers' should be an array of the table's column headers, and 'rows' should be an array of arrays, where each inner array represents a row's cells. Convert all table cell values to strings.
    - If there is no table, the 'data' field should be null.
    
    Return only the raw JSON array, with no surrounding text or markdown formatting.
  `;

  const filePart = {
    inlineData: {
      data: fileData,
      mimeType
    },
  };

  const textPart = {
    text: prompt
  };

  const schema = {
    type: Type.ARRAY,
    description: "An array of quiz questions.",
    items: {
      type: Type.OBJECT,
      properties: {
        id: {
          type: Type.NUMBER,
          description: "A unique numeric ID for the question, starting from 1."
        },
        question: {
          type: Type.STRING,
          description: "The text of the question."
        },
        answer: {
          type: Type.STRING,
          description: "The correct answer to the question."
        },
        data: {
          type: Type.OBJECT,
          description: "Optional structured data, like a table, associated with the question.",
          nullable: true,
          properties: {
            type: {
              type: Type.STRING,
              description: "The type of data, should be 'table'."
            },
            headers: {
              type: Type.ARRAY,
              description: "An array of strings for the table headers.",
              items: { type: Type.STRING }
            },
            rows: {
              type: Type.ARRAY,
              description: "An array of arrays, where each inner array represents a table row. All cell values should be converted to strings.",
              items: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
              }
            }
          }
        }
      },
      required: ['id', 'question', 'answer']
    }
  };


  const response = await ai.models.generateContent({
    model: 'gemini-2.5-pro',
    contents: { parts: [textPart, filePart] },
    config: {
      responseMimeType: "application/json",
      responseSchema: schema,
    },
  });

  const jsonText = response.text;
  
  try {
    const parsedJson = JSON.parse(jsonText);
    if (!Array.isArray(parsedJson)) {
        throw new Error("AI did not return a valid JSON array.");
    }
    // Basic validation could be added here to check if objects have 'id', 'question', 'answer'
    return parsedJson as Question[];
  } catch (e) {
    console.error("Failed to parse JSON response:", jsonText);
    throw new Error("The AI returned an invalid response. Please try a different file or check the console for details.");
  }
};
