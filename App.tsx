import React, { useState, useCallback, useRef, useEffect } from 'react';
import { QUESTIONS } from './constants';
import { Question } from './types';
import { speak, generateQuestionsFromImage } from './services/geminiService';
import { SpeakerIcon } from './components/SpeakerIcon';

const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      // remove the "data:mime/type;base64," prefix
      resolve(result.split(',')[1]);
    };
    reader.onerror = error => reject(error);
  });
};


const App: React.FC = () => {
  const [questions, setQuestions] = useState<Question[]>(QUESTIONS);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState<number>(0);
  const [userAnswer, setUserAnswer] = useState<string>('');
  const [isCorrect, setIsCorrect] = useState<boolean>(false);
  const [isFinished, setIsFinished] = useState<boolean>(false);
  const [isLoadingTTS, setIsLoadingTTS] = useState<boolean>(false);
  const [ttsError, setTtsError] = useState<string | null>(null);
  
  const [isDrawing, setIsDrawing] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Admin panel state
  const [isPasswordMode, setIsPasswordMode] = useState<boolean>(false);
  const [passwordInput, setPasswordInput] = useState<string>('');
  const [showAdminPanel, setShowAdminPanel] = useState<boolean>(false);
  const [appBackgroundColor, setAppBackgroundColor] = useState<string>('bg-gray-100 dark:bg-gray-900');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [generationError, setGenerationError] = useState<string | null>(null);

  // Interest Reward state
  const [isInterestEnabled, setIsInterestEnabled] = useState<boolean>(false);
  const [interestFile, setInterestFile] = useState<File | null>(null);
  const [interestFileUrl, setInterestFileUrl] = useState<string | null>(null);
  const [showInterestReward, setShowInterestReward] = useState<boolean>(false);

  // Urgency Timer state
  const [isUrgencyEnabled, setIsUrgencyEnabled] = useState<boolean>(false);
  const [urgencyTime, setUrgencyTime] = useState<number>(180); // Default to 3 minutes
  const [timerValue, setTimerValue] = useState<number>(180);

  const currentQuestion: Question = questions[currentQuestionIndex];

  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      const context = canvas.getContext('2d');
      if (context) {
        context.clearRect(0, 0, canvas.width, canvas.height);
      }
    }
  }, []);
  
  const resetQuiz = (newQuestions: Question[]) => {
    setQuestions(newQuestions);
    setCurrentQuestionIndex(0);
    setUserAnswer('');
    setIsCorrect(false);
    setIsFinished(false);
    clearCanvas();
  };
  
  const handleNextQuestion = useCallback(() => {
    setShowInterestReward(false);
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
      setUserAnswer('');
      setIsCorrect(false);
      clearCanvas();
    } else {
      setIsFinished(true);
    }
  }, [currentQuestionIndex, questions.length, clearCanvas]);

  // Effect for Urgency Timer countdown
  useEffect(() => {
    if (isUrgencyEnabled && !isFinished && !isCorrect) {
      const timer = setInterval(() => {
        setTimerValue(prev => {
          if (prev > 1) {
            return prev - 1;
          } else {
            clearInterval(timer);
            handleNextQuestion();
            return 0;
          }
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [isUrgencyEnabled, currentQuestionIndex, isFinished, isCorrect, handleNextQuestion]);

  // Effect to reset timer value when question changes or urgency settings change
  useEffect(() => {
    setTimerValue(urgencyTime);
  }, [currentQuestionIndex, urgencyTime, isUrgencyEnabled]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const resizeCanvas = () => {
      const parent = canvas.parentElement;
      if (parent) {
        canvas.width = parent.clientWidth;
        canvas.height = parent.clientHeight;
        const context = canvas.getContext('2d');
        if (context) {
            context.lineCap = 'round';
            context.lineJoin = 'round';
            context.strokeStyle = 'black';
            context.lineWidth = 3;
        }
      }
    };
    
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    return () => window.removeEventListener('resize', resizeCanvas);

  }, [clearCanvas, isFinished, currentQuestionIndex]);

  useEffect(() => {
    if (!isPasswordMode) return;
    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
            setIsPasswordMode(false);
            setPasswordInput('');
            return;
        }
        if (e.key === 'Backspace') {
            setPasswordInput(prev => prev.slice(0, -1));
            return;
        }
        if (e.key.length === 1 && /^[a-zA-Z0-9]$/.test(e.key) && passwordInput.length < 5) {
            const newPassword = passwordInput + e.key.toLowerCase();
            setPasswordInput(newPassword);
            if (newPassword === 'admin') {
                setShowAdminPanel(true);
                setIsPasswordMode(false);
                setPasswordInput('');
            } else if (newPassword.length >= 5) {
                setIsPasswordMode(false);
                setPasswordInput('');
            }
        }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
}, [isPasswordMode, passwordInput]);


  const handleAnswerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const answer = e.target.value;
    setUserAnswer(answer);

    const userAnswerClean = answer.trim().toLowerCase().replace(/\s/g, '');
    let isAnsCorrect = false;

    if (currentQuestion.id === 12) {
      const expectedParts = ['25.14', '76.38'];
      const userParts = userAnswerClean.split('+').filter(p => p);
      if (userParts.length === 2 && expectedParts.includes(userParts[0]) && expectedParts.includes(userParts[1]) && userParts[0] !== userParts[1]) {
        isAnsCorrect = true;
      }
    } else {
      const correctAnswerClean = currentQuestion.answer.toLowerCase().replace(/\s/g, '');
      if (userAnswerClean === correctAnswerClean) {
        isAnsCorrect = true;
      }
    }
    
    if (isAnsCorrect) {
      setIsCorrect(true);
      if (isInterestEnabled && interestFileUrl) {
        setShowInterestReward(true);
      }
    } else {
       setIsCorrect(false);
    }
  };

  const handleRestart = () => {
    setCurrentQuestionIndex(0);
    setUserAnswer('');
    setIsCorrect(false);
    setIsFinished(false);
    clearCanvas();
  };

  const handleSpeak = useCallback(async () => {
    if (isLoadingTTS) return;
    setIsLoadingTTS(true);
    setTtsError(null);
    try {
      await speak(currentQuestion.question);
    } catch (error) {
      console.error("Error with TTS:", error);
      setTtsError("Sorry, I couldn't read that aloud.");
    } finally {
      setIsLoadingTTS(false);
    }
  }, [currentQuestion.question, isLoadingTTS]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      setSelectedFile(event.target.files[0]);
      setGenerationError(null);
    }
  };

  const handleGenerateQuestions = async () => {
    if (!selectedFile) {
      setGenerationError("Please select a file first.");
      return;
    }
    setIsGenerating(true);
    setGenerationError(null);
    try {
      const base64Data = await fileToBase64(selectedFile);
      const newQuestions = await generateQuestionsFromImage(base64Data, selectedFile.type);
      if (newQuestions && newQuestions.length > 0) {
        resetQuiz(newQuestions);
        setShowAdminPanel(false);
        setSelectedFile(null);
      } else {
        throw new Error("The AI returned no questions. Please check the file content.");
      }
    } catch (error) {
      console.error("Failed to generate questions:", error);
      setGenerationError(error instanceof Error ? error.message : "An unknown error occurred.");
    } finally {
      setIsGenerating(false);
    }
  };
  
  const handleInterestFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      const file = event.target.files[0];
      setInterestFile(file);
      if (interestFileUrl) {
        URL.revokeObjectURL(interestFileUrl);
      }
      setInterestFileUrl(URL.createObjectURL(file));
    }
  };

  const getAnswerBorderColor = () => {
    if (isCorrect) return 'border-green-500 focus:ring-green-500';
    if (userAnswer.length > 0 && !isCorrect) return 'border-red-500 focus:ring-red-500';
    return 'border-gray-300 dark:border-gray-600 focus:ring-blue-500';
  };
  
  const getCoords = (event: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    if ('touches' in event.nativeEvent) {
      return { x: event.nativeEvent.touches[0].clientX - rect.left, y: event.nativeEvent.touches[0].clientY - rect.top };
    }
    return { x: event.nativeEvent.clientX - rect.left, y: event.nativeEvent.clientY - rect.top };
  }

  const startDrawing = (event: React.MouseEvent | React.TouchEvent) => {
    const context = canvasRef.current?.getContext('2d');
    if (!context) return;
    const { x, y } = getCoords(event);
    context.beginPath();
    context.moveTo(x, y);
    setIsDrawing(true);
  };

  const draw = (event: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    event.preventDefault(); // Prevent scrolling on touch devices
    const context = canvasRef.current?.getContext('2d');
    if (!context) return;
    const { x, y } = getCoords(event);
    context.lineTo(x, y);
    context.stroke();
  };

  const stopDrawing = () => {
    const context = canvasRef.current?.getContext('2d');
    if (!context) return;
    context.closePath();
    setIsDrawing(false);
  };
  
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const getTimerColor = () => {
    if (timerValue > urgencyTime * 0.5) return 'text-green-500';
    if (timerValue > urgencyTime * 0.2) return 'text-yellow-500';
    return 'text-red-500';
  };


  return (
    <div className={`relative min-h-screen ${appBackgroundColor} text-gray-800 dark:text-gray-200 flex flex-col items-center justify-center p-4 sm:p-6 md:p-8 font-sans transition-colors duration-300`}>
      {/* Admin Button & Password UI */}
      <div className="absolute top-4 left-4 z-40">
          <button 
              onClick={() => { setIsPasswordMode(true); setPasswordInput(''); }} 
              className="p-2 bg-gray-200 dark:bg-gray-700 rounded-full hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
              aria-label="Admin Settings"
          >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-600 dark:text-gray-300" viewBox="0 0 20 20" fill="currentColor">
                 <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0l-.1.41-1.38.65c-1.28.6-1.95 2.12-1.39 3.4l.18.41-1.13 1.03c-1.11 1.01-.52 2.92.8 3.45l1.32.52.4.41c.42 1.76 2.86 1.76 3.28 0l.4-.41 1.32-.52c1.32-.53 1.91-2.44.8-3.45l-1.13-1.03.18-.41c.56-1.28-.11-2.8-1.39-3.4l-1.38-.65-.1-.41zM10 12a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
              </svg>
          </button>
          {isPasswordMode && (
              <div className="absolute top-full left-0 mt-2 flex gap-1.5 p-2 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm rounded-md shadow-lg">
                  {Array.from({ length: 5 }).map((_, i) => (
                      <div key={i} className={`w-3 h-3 rounded-full transition-colors ${i < passwordInput.length ? 'bg-gray-700 dark:bg-gray-200' : 'bg-gray-300 dark:bg-gray-600'}`}></div>
                  ))}
              </div>
          )}
      </div>
      
      <div className="relative w-full min-h-[85vh] max-w-7xl bg-white dark:bg-gray-800 rounded-2xl shadow-2xl flex flex-col">
        {/* Admin Modal */}
        {showAdminPanel && (
            <div className="absolute inset-0 bg-gray-900/60 flex items-center justify-center z-30 rounded-2xl">
                <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl w-full max-w-md m-4 max-h-[90vh] overflow-y-auto">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-xl font-bold">Admin Settings</h3>
                        <button onClick={() => setShowAdminPanel(false)} className="p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                    </div>
                    
                    <div className="space-y-6">
                        {/* Background Color Setting */}
                        <div>
                            <label className="block mb-3 font-semibold text-gray-700 dark:text-gray-300">Background Color</label>
                            <div className="flex gap-4">
                                <button aria-label="Default Background" onClick={() => setAppBackgroundColor('bg-gray-100 dark:bg-gray-900')} className="w-10 h-10 rounded-full bg-gray-100 border-2 border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"></button>
                                <button aria-label="Light Blue Background" onClick={() => setAppBackgroundColor('bg-blue-50 dark:bg-slate-800')} className="w-10 h-10 rounded-full bg-blue-50 border-2 border-blue-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"></button>
                                <button aria-label="Mint Green Background" onClick={() => setAppBackgroundColor('bg-green-50 dark:bg-gray-800')} className="w-10 h-10 rounded-full bg-green-50 border-2 border-green-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"></button>
                                <button aria-label="Soft Pink Background" onClick={() => setAppBackgroundColor('bg-pink-50 dark:bg-gray-800')} className="w-10 h-10 rounded-full bg-pink-50 border-2 border-pink-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"></button>
                            </div>
                        </div>
                        <hr className="dark:border-gray-600"/>
                        {/* Interest Reward Setting */}
                        <div>
                           <label className="flex items-center gap-3 mb-3 font-semibold text-gray-700 dark:text-gray-300">
                             <input type="checkbox" checked={isInterestEnabled} onChange={(e) => setIsInterestEnabled(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"/>
                             Interest Reward
                           </label>
                           <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">Show a rewarding image, video, or audio clip after a correct answer.</p>
                           <input 
                              type="file" 
                              onChange={handleInterestFileChange}
                              disabled={!isInterestEnabled}
                              accept="image/*,video/*,audio/*"
                              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 disabled:opacity-50 dark:file:bg-blue-900/50 dark:file:text-blue-300 dark:hover:file:bg-blue-900"
                           />
                           {interestFile && isInterestEnabled && <p className="text-xs text-gray-500 mt-2">Selected: {interestFile.name}</p>}
                        </div>

                        <hr className="dark:border-gray-600"/>

                        {/* Urgency Timer Setting */}
                        <div>
                           <label className="flex items-center gap-3 mb-3 font-semibold text-gray-700 dark:text-gray-300">
                              <input type="checkbox" checked={isUrgencyEnabled} onChange={(e) => setIsUrgencyEnabled(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"/>
                              Urgency Timer
                           </label>
                           <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">Set a countdown timer for each question.</p>
                           <div className="flex items-center gap-2">
                            <input
                                type="number"
                                value={urgencyTime}
                                onChange={(e) => setUrgencyTime(Math.max(1, parseInt(e.target.value, 10)) || 1)}
                                disabled={!isUrgencyEnabled}
                                className="block w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-transparent disabled:opacity-50"
                                min="1"
                            />
                            <span className="text-sm text-gray-500 dark:text-gray-400">seconds</span>
                           </div>
                        </div>

                        <hr className="dark:border-gray-600"/>

                        {/* Question Generation Setting */}
                        <div>
                           <label className="block mb-3 font-semibold text-gray-700 dark:text-gray-300">Load from File</label>
                           <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">Upload an image or PDF to generate new questions.</p>
                           <input type="file" onChange={handleFileChange} accept="image/jpeg,image/png,image/webp,application/pdf" className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 dark:file:bg-blue-900/50 dark:file:text-blue-300 dark:hover:file:bg-blue-900"/>
                           {selectedFile && <p className="text-xs text-gray-500 mt-2">Selected: {selectedFile.name}</p>}
                           <button onClick={handleGenerateQuestions} disabled={!selectedFile || isGenerating} className="w-full mt-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-bold py-2 px-4 rounded-lg shadow-md transition-transform transform hover:scale-105 focus:outline-none focus:ring-4 focus:ring-blue-400/50 flex items-center justify-center gap-2">
                            {isGenerating ? (<><svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>Generating...</>) : "Generate Questions"}
                           </button>
                           {generationError && <p className="text-red-500 text-sm mt-2">{generationError}</p>}
                        </div>
                    </div>
                </div>
            </div>
        )}
         {/* Interest Reward Modal */}
        {showInterestReward && interestFileUrl && (
          <div className="absolute inset-0 bg-gray-900/80 backdrop-blur-sm flex flex-col items-center justify-center z-20 rounded-2xl p-4">
              <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col items-center">
                  <h3 className="text-2xl font-bold text-green-500 mb-4">Great Job!</h3>
                  <div className="w-full h-auto max-h-[60vh] flex items-center justify-center mb-6">
                      {interestFile?.type.startsWith('image/') && <img src={interestFileUrl} alt="Reward" className="max-w-full max-h-full object-contain rounded-md"/>}
                      {interestFile?.type.startsWith('video/') && <video src={interestFileUrl} controls autoPlay loop className="max-w-full max-h-full object-contain rounded-md"/>}
                      {interestFile?.type.startsWith('audio/') && <audio src={interestFileUrl} controls autoPlay className="w-full"/>}
                  </div>
                  <button onClick={handleNextQuestion} className="w-full sm:w-auto bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-8 rounded-lg shadow-md transition-transform transform hover:scale-105 focus:outline-none focus:ring-4 focus:ring-green-400/50">
                      Next Question
                  </button>
              </div>
          </div>
        )}

        {isFinished ? (
          <div className="text-center w-full flex flex-col items-center justify-center flex-grow">
            <h2 className="text-4xl font-bold text-green-500 mb-4">Congratulations!</h2>
            <p className="text-xl mb-8">You've completed all the questions.</p>
            <button onClick={handleRestart} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-8 rounded-lg shadow-lg transition-transform transform hover:scale-105">
              Start Over
            </button>
          </div>
        ) : (
          <>
            {/* Top Section: Question */}
            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
                <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-blue-500 dark:text-blue-400">
                    Question {currentQuestionIndex + 1} of {questions.length}
                    </span>
                </div>
                <div className="text-2xl font-semibold mt-2 cursor-pointer group flex items-start gap-3" onClick={handleSpeak}>
                  <SpeakerIcon isLoading={isLoadingTTS} className="w-7 h-7 mt-1 text-gray-500 dark:text-gray-400 group-hover:text-blue-500 transition-colors flex-shrink-0"/>
                  <span>{currentQuestion.question}</span>
                </div>
                {ttsError && <p className="text-red-500 text-sm mt-2">{ttsError}</p>}
                {currentQuestion.data?.type === 'table' && (
                  <div className="mt-4 overflow-x-auto relative shadow-md sm:rounded-lg">
                    <table className="w-full text-sm text-left text-gray-500 dark:text-gray-400">
                       <thead className="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-gray-700 dark:text-gray-400">
                        <tr>{currentQuestion.data.headers.map((header) => (<th key={header} scope="col" className="px-6 py-3">{header}</th>))}</tr>
                      </thead>
                      <tbody>
                        {currentQuestion.data.rows.map((row, rowIndex) => (
                          <tr key={rowIndex} className="bg-white border-b dark:bg-gray-800 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600">
                            {row.map((cell, cellIndex) => (<td key={cellIndex} className={`px-6 py-4 ${cellIndex === 0 ? 'font-medium text-gray-900 whitespace-nowrap dark:text-white' : ''}`}>{cell}</td>))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
            </div>

            {/* Bottom Section: Workspace */}
            <div className="flex-grow p-6 flex flex-col relative">
                <div className="flex justify-between items-center mb-4 flex-shrink-0">
                    <h2 className="text-lg font-semibold text-gray-700 dark:text-gray-300">Show your work</h2>
                    <button onClick={clearCanvas} className="text-sm bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 px-4 py-2 rounded-md transition-colors">Clear</button>
                </div>
                <div className="flex-grow relative border-2 border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden">
                    <canvas ref={canvasRef} className="w-full h-full bg-white dark:bg-gray-700 cursor-crosshair" onMouseDown={startDrawing} onMouseMove={draw} onMouseUp={stopDrawing} onMouseLeave={stopDrawing} onTouchStart={startDrawing} onTouchMove={draw} onTouchEnd={stopDrawing}/>
                     <div className="absolute bottom-4 right-4 z-10 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm p-4 rounded-lg shadow-lg w-full max-w-xs">
                        <label htmlFor="answer" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Your Final Answer</label>
                        <input id="answer" type="text" value={userAnswer} onChange={handleAnswerChange} placeholder="Type answer here" className={`w-full p-3 border-2 rounded-lg bg-gray-50 dark:bg-gray-700 font-semibold focus:outline-none focus:ring-2 transition-all duration-300 ${getAnswerBorderColor()}`} autoComplete="off"/>
                        {isCorrect && !showInterestReward && (
                            <button onClick={handleNextQuestion} className="w-full mt-3 bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg shadow-md transition-transform transform hover:scale-105 focus:outline-none focus:ring-4 focus:ring-green-400/50">
                                Next Question
                            </button>
                        )}
                    </div>
                </div>
            </div>
          </>
        )}
      </div>

       {/* Big Timer Display */}
       {isUrgencyEnabled && !isFinished && (
        <div className={`mt-6 text-9xl font-mono font-bold tracking-wider transition-colors duration-500 ${getTimerColor()}`}>
            {formatTime(timerValue)}
        </div>
      )}
    </div>
  );
};

export default App;
