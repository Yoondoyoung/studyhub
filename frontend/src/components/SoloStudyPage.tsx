import { useState, useEffect, useRef } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Textarea } from './ui/textarea';
import { Upload, BookOpen, GraduationCap, Loader2, Mic, MicOff, X, Plus, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { apiBase } from '../utils/api';

interface Message {
  role: 'user' | 'ai';
  content: string;
}

interface FileData {
  id: string;
  fileName: string;
  fileType: string;
  preview?: string;
}

interface Session {
  id: string;
  name: string;
  fileCount: number;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
  files?: FileData[];
  chatHistory?: Message[];
  quizData?: QuizData;
  quizSettings?: {
    count: number;
    difficulty: string;
  };
}

interface QuizQuestion {
  id: number;
  question: string;
  options: string[];
  correctAnswer: number;
  explanation: string;
}

interface QuizData {
  questions: QuizQuestion[];
}

interface SoloStudyPageProps {
  initialSessionId?: string | null;
  onSessionsChange?: () => void;
}

export function SoloStudyPage({ initialSessionId, onSessionsChange }: SoloStudyPageProps) {
  const [mode, setMode] = useState<'teach' | 'student'>('student');
  const [teachPhase, setTeachPhase] = useState<'teaching' | 'quiz'>('teaching');
  const [studentMessages, setStudentMessages] = useState<Message[]>([]);
  const [teachMessages, setTeachMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [currentSession, setCurrentSession] = useState<Session | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [uploadedFiles, setUploadedFiles] = useState<FileData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessingVoice, setIsProcessingVoice] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);
  const [quizData, setQuizData] = useState<QuizData | null>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [answeredQuestions, setAnsweredQuestions] = useState<{ [key: number]: number }>({});
  const [isGeneratingQuiz, setIsGeneratingQuiz] = useState(false);
  const [showQuizResult, setShowQuizResult] = useState(false);
  const [showQuizReview, setShowQuizReview] = useState(false);
  const [showQuizSettings, setShowQuizSettings] = useState(false);
  const [quizCount, setQuizCount] = useState(10);
  const [quizDifficulty, setQuizDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  
  // Current messages based on mode
  const messages = mode === 'student' ? studentMessages : teachMessages;
  const setMessages = mode === 'student' ? setStudentMessages : setTeachMessages;
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Load session on mount (but don't auto-create)
  useEffect(() => {
    const initializeSession = async () => {
      try {
        const token = localStorage.getItem('accessToken');
        if (!token) return;

        // If initialSessionId is provided and not null, load that session
        if (initialSessionId !== undefined && initialSessionId !== null) {
          await loadSession(initialSessionId);
          return;
        }

        // If initialSessionId is explicitly null (from "AI Study" direct click)
        // Don't create session yet - wait for user action
        if (initialSessionId === null) {
          setCurrentSession(null);
          setUploadedFiles([]);
          setStudentMessages([]);
          setTeachMessages([]);
          setQuizData(null);
          setCurrentQuestionIndex(0);
          setAnsweredQuestions({});
          setShowQuizResult(false);
          setShowQuizReview(false);
          return;
        }

        // Otherwise, try to load active session (page refresh case)
        const response = await fetch(`${apiBase}/ai/sessions/active/current`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        if (response.ok) {
          const data = await response.json();
          if (data.session) {
            setCurrentSession(data.session);
            setUploadedFiles(data.session.files || []);
            
            // Convert student chat history
            if (data.session.studentChatHistory) {
              const studentMsgs: Message[] = data.session.studentChatHistory.map((msg: any) => ({
                role: msg.role === 'assistant' ? 'ai' : msg.role,
                content: msg.content
              }));
              setStudentMessages(studentMsgs);
            }
            
            // Convert teach chat history
            if (data.session.teachChatHistory) {
              const teachMsgs: Message[] = data.session.teachChatHistory.map((msg: any) => ({
                role: msg.role === 'assistant' ? 'ai' : msg.role,
                content: msg.content
              }));
              setTeachMessages(teachMsgs);
            }
          }
          // If no active session, just leave it empty
        }

        // Load session history
        await loadSessions();
      } catch (error) {
        console.error('Failed to initialize session:', error);
      }
    };

    initializeSession();
  }, [initialSessionId]);

  const loadSessions = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      if (!token) return;

      const response = await fetch(`${apiBase}/ai/sessions`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setSessions(data.sessions || []);
        onSessionsChange?.(); // Notify parent to update
      }
    } catch (error) {
      console.error('Failed to load sessions:', error);
    }
  };

  const createNewSession = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      if (!token) {
        toast.error('Please login first');
        return null;
      }

      const response = await fetch(`${apiBase}/ai/sessions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setCurrentSession(data.session);
        setUploadedFiles([]);
        setStudentMessages([]);
        setTeachMessages([]);
        setQuizData(null);
        setCurrentQuestionIndex(0);
        setAnsweredQuestions({});
        setShowQuizResult(false);
        setShowQuizReview(false);
        toast.success('New study session created!');
        await loadSessions();
        onSessionsChange?.(); // Notify parent
        return data.session;
      }
      return null;
    } catch (error) {
      console.error('Failed to create session:', error);
      toast.error('Failed to create new session');
      return null;
    }
  };

  // Helper: Ensure session exists (create if needed)
  const ensureSession = async (): Promise<Session | null> => {
    if (currentSession) return currentSession;
    return await createNewSession();
  };

  // Generate quiz questions
  const generateQuiz = async (showToast = true) => {
    if (!currentSession) {
      toast.error('No active session');
      return;
    }

    setIsGeneratingQuiz(true);
    setShowQuizSettings(false); // Close settings popup

    try {
      const token = localStorage.getItem('accessToken');
      if (!token) {
        toast.error('Please login first');
        return;
      }

      const response = await fetch(`${apiBase}/ai/sessions/${currentSession.id}/generate-quiz`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          count: quizCount,
          difficulty: quizDifficulty,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to generate quiz');
      }

      const data = await response.json();
      setQuizData(data.quiz);
      setCurrentQuestionIndex(0);
      setSelectedAnswer(null);
      setAnsweredQuestions({});
      setShowQuizResult(false);
      if (showToast) {
        toast.success('Quiz generated! Questions ready.');
      }
    } catch (error) {
      console.error('Quiz generation error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to generate quiz');
    } finally {
      setIsGeneratingQuiz(false);
    }
  };

  // Reset and generate new quiz
  const handleNewQuiz = () => {
    if (window.confirm('Are you sure you want to start a new quiz? Current progress will be lost.')) {
      setShowQuizSettings(true);
    }
  };

  const loadSession = async (sessionId: string) => {
    try {
      const token = localStorage.getItem('accessToken');
      if (!token) return;

      const response = await fetch(`${apiBase}/ai/sessions/${sessionId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        
        // Set as active session
        await fetch(`${apiBase}/ai/sessions/${sessionId}/activate`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

      setCurrentSession(data.session);
      setUploadedFiles(data.session.files || []);
      
      // Convert student chat history
      if (data.session.studentChatHistory) {
        const studentMsgs: Message[] = data.session.studentChatHistory.map((msg: any) => ({
          role: msg.role === 'assistant' ? 'ai' : msg.role,
          content: msg.content
        }));
        setStudentMessages(studentMsgs);
      } else {
        setStudentMessages([]);
      }
      
      // Convert teach chat history
      if (data.session.teachChatHistory) {
        const teachMsgs: Message[] = data.session.teachChatHistory.map((msg: any) => ({
          role: msg.role === 'assistant' ? 'ai' : msg.role,
          content: msg.content
        }));
        setTeachMessages(teachMsgs);
      } else {
        setTeachMessages([]);
      }

      // Load quiz data if exists
      if (data.session.quizData) {
        setQuizData(data.session.quizData);
        if (data.session.quizSettings) {
          setQuizCount(data.session.quizSettings.count || 10);
          setQuizDifficulty(data.session.quizSettings.difficulty || 'medium');
        }
      } else {
        setQuizData(null);
      }

      // Reset quiz state
      setCurrentQuestionIndex(0);
      setAnsweredQuestions({});
      setShowQuizResult(false);
      setShowQuizReview(false);

      toast.success('Session loaded!');
      }
    } catch (error) {
      console.error('Failed to load session:', error);
      toast.error('Failed to load session');
    }
  };

  const handleFileSelection = async (file: File) => {
    if (uploadedFiles.length >= 3) {
      toast.error('Maximum 3 files per session');
      return;
    }

    setIsUploading(true);

    try {
      const token = localStorage.getItem('accessToken');
      if (!token) {
        toast.error('Please login first');
        return;
      }

      // Ensure session exists
      const session = await ensureSession();
      if (!session) {
        toast.error('Failed to create session');
        return;
      }

      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`${apiBase}/ai/sessions/${session.id}/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Upload failed');
      }

      const data = await response.json();
      setUploadedFiles(prev => [...prev, data.file]);
      toast.success(`Uploaded: ${data.file.fileName} (${uploadedFiles.length + 1}/3)`);
      
      // Reload sessions to update file count
      await loadSessions();
    } catch (error) {
      console.error('Upload error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to upload file');
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await handleFileSelection(file);
    e.target.value = '';
  };

  const handleFileDelete = async (fileId: string) => {
    if (!currentSession) return;

    try {
      const token = localStorage.getItem('accessToken');
      if (!token) return;

      const response = await fetch(`${apiBase}/ai/sessions/${currentSession.id}/files/${fileId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        setUploadedFiles(prev => prev.filter(f => f.id !== fileId));
        toast.success('File removed');
        await loadSessions();
      }
    } catch (error) {
      console.error('Delete error:', error);
      toast.error('Failed to delete file');
    }
  };

  const handleSendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = { role: 'user', content: input };
    setMessages([...messages, userMessage]);
    const currentInput = input;
    setInput('');
    setIsLoading(true);

    try {
      const token = localStorage.getItem('accessToken');
      if (!token) {
        toast.error('Please login first');
        setIsLoading(false);
        return;
      }

      // Ensure session exists
      const session = await ensureSession();
      if (!session) {
        toast.error('Failed to create session');
        setIsLoading(false);
        return;
      }

      const response = await fetch(`${apiBase}/ai/sessions/${session.id}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          message: currentInput,
          mode: mode,
          phase: mode === 'teach' ? teachPhase : undefined,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to get response');
      }

      const data = await response.json();
      const aiMessage: Message = { role: 'ai', content: data.response };
      setMessages(prev => [...prev, aiMessage]);
      
      // Update sessions list to reflect new message count
      await loadSessions();
    } catch (error) {
      console.error('Chat error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to get AI response');
      
      // Add error message to chat
      const errorMessage: Message = { 
        role: 'ai', 
        content: 'Sorry, I encountered an error. Please try again.' 
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        await sendVoiceMessage(audioBlob);
        
        // Stop all tracks
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      toast.success('Recording started');
    } catch (error) {
      console.error('Failed to start recording:', error);
      toast.error('Failed to access microphone');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      toast.info('Recording stopped, processing...');
    }
  };

  const handleVoiceClick = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  const sendVoiceMessage = async (audioBlob: Blob) => {
    setIsProcessingVoice(true);

    try {
      const token = localStorage.getItem('accessToken');
      if (!token) {
        toast.error('Please login first');
        return;
      }

      // Ensure session exists
      const session = await ensureSession();
      if (!session) {
        toast.error('Failed to create session');
        return;
      }

      const formData = new FormData();
      formData.append('audio', audioBlob, 'recording.webm');
      formData.append('mode', mode);
      if (mode === 'teach') {
        formData.append('phase', teachPhase);
      }

      const response = await fetch(`${apiBase}/ai/sessions/${session.id}/voice-chat`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to process voice');
      }

      const data = await response.json();
      
      // Add user message (transcribed text)
      const userMessage: Message = { role: 'user', content: data.userMessage };
      setMessages(prev => [...prev, userMessage]);

      // Add AI response
      const aiMessage: Message = { role: 'ai', content: data.aiResponse };
      setMessages(prev => [...prev, aiMessage]);

      // Play AI response audio
      if (data.audioBase64) {
        const audioData = atob(data.audioBase64);
        const audioArray = new Uint8Array(audioData.length);
        for (let i = 0; i < audioData.length; i++) {
          audioArray[i] = audioData.charCodeAt(i);
        }
        const audioBlob = new Blob([audioArray], { type: 'audio/mpeg' });
        const audioUrl = URL.createObjectURL(audioBlob);
        const audio = new Audio(audioUrl);
        audio.play();
        
        // Clean up URL when audio finishes
        audio.onended = () => URL.revokeObjectURL(audioUrl);
      }

      toast.success('Voice message processed!');
      await loadSessions();
    } catch (error) {
      console.error('Voice message error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to process voice message');
      
      const errorMessage: Message = { 
        role: 'ai', 
        content: 'Sorry, I encountered an error processing your voice message. Please try again.' 
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsProcessingVoice(false);
    }
  };

  return (
    <>
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-stretch">
      <div className="xl:col-span-8">
        <div className="rounded-[36px] bg-white/60 shadow-[0_30px_80px_rgba(15,23,42,0.08)] p-6 h-[720px] overflow-y-auto">
          <div>
          <Tabs value={mode} onValueChange={(v) => setMode(v as 'teach' | 'student')}>

        <TabsContent value="student" className="space-y-4" />

        <TabsContent value="teach" className="space-y-4" />
      </Tabs>

      <Card className="h-[670px] flex flex-col rounded-3xl bg-white/90 shadow-[0_20px_60px_rgba(15,23,42,0.08)] border-0 overflow-hidden">
        <CardHeader className="pt-3 pb-2">
          <div className="flex items-start pt-4 justify-between gap-4">
            <CardTitle className="min-w-[120px]">
              {mode === 'teach' && teachPhase === 'quiz' ? 'Quiz' : 'Chat'}
            </CardTitle>
            <div className="flex-1 text-center">
              {currentSession && (
                <p className="text-xs text-gray-500">
                  {currentSession.name}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                size="sm"
                onClick={createNewSession}
                disabled={isLoading || isUploading}
              >
                <Plus className="size-4 mr-2" />
                New Study
              </Button>
            </div>
          </div>
          {mode === 'teach' && teachPhase === 'quiz' && quizData && !showQuizResult && (
            <div className="mt-2 flex justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={handleNewQuiz}
                disabled={isGeneratingQuiz}
              >
                🔄 New Quiz
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent className="flex-1 min-h-0 flex flex-col pt-0">
          {/* Quiz UI - only show in Quiz Phase */}
          {mode === 'teach' && teachPhase === 'quiz' ? (
            <div className="flex-1 flex flex-col">
              {isGeneratingQuiz ? (
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center">
                    <Loader2 className="size-12 animate-spin mx-auto mb-4 text-blue-600" />
                    <p className="text-sm text-muted-foreground">Generating quiz questions...</p>
                  </div>
                </div>
              ) : showQuizReview && quizData ? (
                /* Quiz Review Screen - Wrong Answers */
                <div className="flex-1 flex flex-col overflow-y-auto">
                  <div className="mb-4 pb-4 border-b">
                    <h3 className="text-xl font-bold">Wrong Answers Review</h3>
                    <p className="text-sm text-muted-foreground">
                      Review the questions you got wrong
                    </p>
                  </div>

                  <div className="space-y-6 flex-1 overflow-y-auto mb-4">
                    {quizData.questions.map((question, idx) => {
                      const userAnswer = answeredQuestions[idx];
                      const isWrong = userAnswer !== question.correctAnswer;
                      
                      if (!isWrong) return null;

                      return (
                        <div key={idx} className="border rounded-lg p-4 bg-red-50 border-red-200">
                          <h4 className="font-semibold mb-3">
                            Q{idx + 1}. {question.question}
                          </h4>

                          <div className="space-y-2 mb-3">
                            <div className="flex items-start gap-2 p-2 bg-red-100 rounded">
                              <span className="text-red-600 font-bold">✗</span>
                              <div>
                                <span className="text-sm text-gray-600">Your answer:</span>
                                <p className="font-medium text-red-700">
                                  {String.fromCharCode(65 + userAnswer)}. {question.options[userAnswer]}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-start gap-2 p-2 bg-green-100 rounded">
                              <span className="text-green-600 font-bold">✓</span>
                              <div>
                                <span className="text-sm text-gray-600">Correct answer:</span>
                                <p className="font-medium text-green-700">
                                  {String.fromCharCode(65 + question.correctAnswer)}. {question.options[question.correctAnswer]}
                                </p>
                              </div>
                            </div>
                          </div>

                          <div className="p-3 bg-blue-50 rounded border border-blue-200">
                            <p className="text-sm font-semibold text-blue-900 mb-1">Explanation:</p>
                            <p className="text-sm text-gray-700">{question.explanation}</p>
                          </div>
                        </div>
                      );
                    })}

                    {Object.values(answeredQuestions).filter((a, i) => a !== quizData.questions[i]?.correctAnswer).length === 0 && (
                      <div className="text-center py-12">
                        <div className="text-6xl mb-4">🎉</div>
                        <p className="text-lg font-semibold">Perfect score! No wrong answers to review.</p>
                      </div>
                    )}
                  </div>

                  <div className="pt-4 border-t">
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => setShowQuizReview(false)}
                    >
                      Back to Results
                    </Button>
                  </div>
                </div>
              ) : showQuizResult && quizData ? (
                /* Quiz Result Screen */
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center max-w-md w-full">
                    <div className="mb-8">
                      <div className="text-6xl mb-4">🎉</div>
                      <h2 className="text-3xl font-bold mb-2">Quiz Completed!</h2>
                    </div>

                    <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl p-8 mb-6 border-2 border-blue-200">
                      <div className="text-5xl font-bold text-blue-600 mb-4">
                        {Object.values(answeredQuestions).filter((a, i) => a === quizData.questions[i]?.correctAnswer).length} / {quizData.questions.length}
                      </div>
                      <div className="flex justify-center gap-6 text-sm">
                        <div className="flex items-center gap-2">
                          <span className="text-2xl">✓</span>
                          <span className="text-green-700 font-semibold">
                            {Object.values(answeredQuestions).filter((a, i) => a === quizData.questions[i]?.correctAnswer).length} Correct
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-2xl">✗</span>
                          <span className="text-red-700 font-semibold">
                            {Object.values(answeredQuestions).filter((a, i) => a !== quizData.questions[i]?.correctAnswer).length} Wrong
                          </span>
                        </div>
                      </div>
                    </div>

                    <p className="text-lg mb-6 text-gray-700">
                      {Object.values(answeredQuestions).filter((a, i) => a === quizData.questions[i]?.correctAnswer).length >= 8 
                        ? "Excellent work! 🌟" 
                        : Object.values(answeredQuestions).filter((a, i) => a === quizData.questions[i]?.correctAnswer).length >= 6
                        ? "Good job! Keep practicing! 💪"
                        : "Keep studying! You'll do better next time! 📚"}
                    </p>

                    <div className="space-y-3">
                      {Object.values(answeredQuestions).filter((a, i) => a !== quizData.questions[i]?.correctAnswer).length > 0 && (
                        <Button
                          variant="outline"
                          className="w-full"
                          onClick={() => setShowQuizReview(true)}
                        >
                          <BookOpen className="size-4 mr-2" />
                          Review Wrong Answers
                        </Button>
                      )}
                      <Button
                        className="w-full"
                        size="lg"
                        onClick={() => {
                          setShowQuizReview(false);
                          setShowQuizSettings(true);
                        }}
                      >
                        <Plus className="size-5 mr-2" />
                        Start New Quiz
                      </Button>
                      <Button
                        variant="outline"
                        className="w-full"
                        onClick={() => {
                          setTeachPhase('teaching');
                          setShowQuizReview(false);
                        }}
                      >
                        Back to Teaching
                      </Button>
                    </div>
                  </div>
                </div>
              ) : quizData && quizData.questions.length > 0 ? (
                <>
                  {/* Progress Bar */}
                  <div className="flex items-center justify-between mb-4 pb-2 border-b">
                    <span className="text-sm font-medium">
                      {currentQuestionIndex + 1} / {quizData.questions.length}
                    </span>
                    <div className="flex gap-2">
                      <span className="text-xs px-2 py-1 bg-red-100 text-red-700 rounded">
                        ✗ {Object.values(answeredQuestions).filter((a, i) => a !== quizData.questions[i]?.correctAnswer).length}
                      </span>
                      <span className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded">
                        ✓ {Object.values(answeredQuestions).filter((a, i) => a === quizData.questions[i]?.correctAnswer).length}
                      </span>
                    </div>
                  </div>

                  {/* Current Question */}
                  {(() => {
                    const currentQ = quizData.questions[currentQuestionIndex];
                    const hasAnswered = answeredQuestions[currentQuestionIndex] !== undefined;
                    const userAnswer = answeredQuestions[currentQuestionIndex];
                    const isCorrect = userAnswer === currentQ.correctAnswer;

                    return (
                      <div className="flex-1 flex flex-col">
                        <h3 className="text-lg font-semibold mb-6">
                          {currentQuestionIndex + 1}. {currentQ.question}
                        </h3>

                        <div className="space-y-3 mb-6">
                          {currentQ.options.map((option, idx) => {
                            const isSelected = selectedAnswer === idx || userAnswer === idx;
                            const isCorrectOption = idx === currentQ.correctAnswer;
                            const showResult = hasAnswered;

                            let buttonClass = "w-full text-left px-4 py-3 rounded-lg border-2 transition-all ";
                            if (showResult && isCorrectOption) {
                              buttonClass += "border-green-500 bg-green-50";
                            } else if (showResult && isSelected && !isCorrectOption) {
                              buttonClass += "border-red-500 bg-red-50";
                            } else if (isSelected) {
                              buttonClass += "border-blue-500 bg-blue-50";
                            } else {
                              buttonClass += "border-gray-200 hover:border-gray-300 hover:bg-gray-50";
                            }

                            return (
                              <button
                                key={idx}
                                onClick={() => {
                                  if (!hasAnswered) {
                                    setSelectedAnswer(idx);
                                    setAnsweredQuestions({ ...answeredQuestions, [currentQuestionIndex]: idx });
                                  }
                                }}
                                disabled={hasAnswered}
                                className={buttonClass}
                              >
                                <div className="flex items-start gap-3">
                                  <span className="font-semibold text-gray-600">
                                    {String.fromCharCode(65 + idx)}.
                                  </span>
                                  <span className="flex-1">{option}</span>
                                  {showResult && isCorrectOption && (
                                    <span className="text-green-600 font-semibold">✓</span>
                                  )}
                                </div>
                              </button>
                            );
                          })}
                        </div>

                        {hasAnswered && (
                          <div className={`p-4 rounded-lg mb-4 ${isCorrect ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                            <p className={`font-semibold mb-2 ${isCorrect ? 'text-green-700' : 'text-red-700'}`}>
                              {isCorrect ? "✓ That's right!" : "✗ Incorrect"}
                            </p>
                            <p className="text-sm text-gray-700">{currentQ.explanation}</p>
                          </div>
                        )}

                        {/* Navigation */}
                        <div className="flex gap-2 mt-auto">
                          <Button
                            variant="outline"
                            onClick={() => setCurrentQuestionIndex(Math.max(0, currentQuestionIndex - 1))}
                            disabled={currentQuestionIndex === 0}
                          >
                            Back
                          </Button>
                          <Button
                            className="flex-1"
                            onClick={() => {
                              if (currentQuestionIndex < quizData.questions.length - 1) {
                                setCurrentQuestionIndex(currentQuestionIndex + 1);
                                setSelectedAnswer(null);
                              } else {
                                setShowQuizResult(true);
                              }
                            }}
                            disabled={!hasAnswered}
                          >
                            {currentQuestionIndex < quizData.questions.length - 1 ? 'Next' : 'Finish'}
                          </Button>
                        </div>
                      </div>
                    );
                  })()}
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center">
                    <BookOpen className="size-12 mx-auto mb-4 text-gray-400" />
                    <p className="text-sm text-muted-foreground mb-4">No quiz available</p>
                    <Button onClick={() => setShowQuizSettings(true)}>Generate Quiz</Button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Chat UI - show in Student Mode and Teaching Phase */
            <>
              <div className="flex-1 space-y-4 mb-4 overflow-y-auto max-h-96">
                {messages.length === 0 ? (
                  <div className="text-center text-muted-foreground py-12">
                    {mode === 'teach' 
                      ? "Start by explaining a concept you're studying..."
                      : "Ask me anything about your study material..."}
                  </div>
                ) : (
                  messages.map((msg, idx) => (
                    <div
                      key={idx}
                      className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[80%] rounded-2xl px-4 py-3 leading-relaxed ${
                          msg.role === 'user'
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-100 text-gray-900'
                        }`}
                      >
                        <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                      </div>
                    </div>
                  ))
                )}
                {isLoading && (
                  <div className="flex justify-start">
                    <div className="max-w-[80%] rounded-2xl px-4 py-3 bg-gray-100 text-gray-900 leading-relaxed">
                      <div className="flex items-center gap-2">
                        <Loader2 className="size-4 animate-spin" />
                        <p className="text-sm">AI is thinking...</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="rounded-[20px] border border-gray-200 bg-white/80 p-4 shadow-sm">
                <Textarea
                  placeholder={
                    mode === 'teach'
                      ? "Explain the concept in your own words..."
                      : "What do you want to know?"
                  }
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  className="min-h-[72px] resize-none border-0 bg-transparent p-0 pt-1 leading-relaxed shadow-none focus-visible:ring-0"
                  rows={3}
                  disabled={isRecording || isProcessingVoice}
                />
                <div className="mt-3 flex items-center justify-between">
                  <Button 
                    onClick={handleVoiceClick}
                    variant={isRecording ? "destructive" : "outline"}
                    size="sm"
                    className="gap-2"
                    disabled={isLoading || isProcessingVoice}
                  >
                    {isProcessingVoice ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />
                        Processing...
                      </>
                    ) : isRecording ? (
                      <>
                        <MicOff className="size-4" />
                        Stop
                      </>
                    ) : (
                      <>
                        <Mic className="size-4" />
                        Voice
                      </>
                    )}
                  </Button>
                  <Button 
                    onClick={handleSendMessage} 
                    disabled={isLoading || !input.trim() || isRecording || isProcessingVoice}
                    className="rounded-full h-11 w-11 p-0"
                  >
                    {isLoading ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      '↑'
                    )}
                  </Button>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  variant={mode === 'student' ? 'default' : 'outline'}
                  size="sm"
                  className="rounded-full"
                  onClick={() => setMode('student')}
                >
                  <BookOpen className="size-4 mr-2" />
                  Student Mode
                </Button>
                <Button
                  variant={mode === 'teach' ? 'default' : 'outline'}
                  size="sm"
                  className="rounded-full"
                  onClick={() => setMode('teach')}
                >
                  <GraduationCap className="size-4 mr-2" />
                  Teach Mode
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full"
                  onClick={() => {
                    setMode('teach');
                    setTeachPhase('teaching');
                    setShowQuizSettings(true);
                  }}
                  disabled={isGeneratingQuiz}
                >
                  <BookOpen className="size-4 mr-2" />
                  Create Quiz
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
          </div>
        </div>
      </div>

      <div className="xl:col-span-4">
        <div className="rounded-[36px] bg-white/60 shadow-[0_30px_80px_rgba(15,23,42,0.08)] p-6 h-[720px] overflow-y-auto">
          <div className="space-y-6">
          {/* File Upload Area */}
          <Card
            className={`rounded-3xl bg-white/90 shadow-[0_20px_60px_rgba(15,23,42,0.08)] border-2 ${
              isDragActive ? 'border-purple-300 bg-white' : 'border-transparent'
            }`}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragActive(true);
            }}
            onDragLeave={() => setIsDragActive(false)}
            onDrop={(event) => {
              event.preventDefault();
              setIsDragActive(false);
              const file = event.dataTransfer.files?.[0];
              if (file) handleFileSelection(file);
            }}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                fileInputRef.current?.click();
              }
            }}
          >
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle className="text-lg">Study Materials ({uploadedFiles.length}/3)</CardTitle>
                <input
                  id="file-upload"
                  type="file"
                  accept=".pdf,.txt,.md,.png,.jpg,.jpeg,.gif,.webp,.mp3,.wav,.m4a,.mp4,.webm,text/plain,application/pdf,image/*,audio/*"
                  className="hidden"
                  onChange={handleFileUpload}
                  disabled={isUploading || uploadedFiles.length >= 3}
                  ref={fileInputRef}
                />
              </div>
            </CardHeader>
            <CardContent>
              {uploadedFiles.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="size-12 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Drag & drop files here or click to upload (max 3).</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {uploadedFiles.map((file) => (
                    <div
                      key={file.id}
                      className="flex items-center justify-between p-3 bg-white/80 rounded-2xl border border-white/70"
                    >
                      <div className="flex items-center gap-2">
                        <FileText className="size-4 text-blue-600" />
                        <span className="text-sm font-medium">{file.fileName}</span>
                        <span className="text-xs text-muted-foreground">({file.fileType})</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleFileDelete(file.id)}
                        className="hover:bg-red-100 hover:text-red-600"
                      >
                        <X className="size-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
          </div>
        </div>
      </div>
    </div>

    {/* Quiz Settings Popup */}
      {showQuizSettings && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <Card className="w-full max-w-md mx-4 rounded-3xl bg-white/95 shadow-[0_20px_60px_rgba(15,23,42,0.2)] border-0">
            <CardHeader>
              <CardTitle className="text-2xl">Generate Quiz</CardTitle>
              <p className="text-sm text-muted-foreground">
                Customize your quiz settings
              </p>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Number of Questions */}
              <div>
                <label className="text-sm font-semibold mb-3 block">
                  Number of Questions
                </label>
                <div className="flex gap-3">
                  {[5, 10, 15].map((count) => (
                    <Button
                      key={count}
                      variant={quizCount === count ? 'default' : 'outline'}
                      onClick={() => setQuizCount(count)}
                      className="flex-1"
                    >
                      {count}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Difficulty Level */}
              <div>
                <label className="text-sm font-semibold mb-3 block">
                  Difficulty Level
                </label>
                <div className="flex flex-col gap-2">
                  {[
                    { value: 'easy', label: 'Easy', desc: 'Basic concepts and definitions', emoji: '😊' },
                    { value: 'medium', label: 'Medium', desc: 'Balanced understanding and application', emoji: '🤔' },
                    { value: 'hard', label: 'Hard', desc: 'Deep analysis and critical thinking', emoji: '🔥' }
                  ].map((diff) => (
                    <Button
                      key={diff.value}
                      variant={quizDifficulty === diff.value ? 'default' : 'outline'}
                      onClick={() => setQuizDifficulty(diff.value as 'easy' | 'medium' | 'hard')}
                      className="w-full justify-start h-auto py-3"
                    >
                      <div className="flex items-start gap-3 text-left">
                        <span className="text-2xl">{diff.emoji}</span>
                        <div>
                          <div className="font-semibold">{diff.label}</div>
                          <div className="text-xs opacity-80">{diff.desc}</div>
                        </div>
                      </div>
                    </Button>
                  ))}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 pt-4 border-t">
                <Button
                  variant="outline"
                  onClick={() => setShowQuizSettings(false)}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    setTeachPhase('quiz');
                    setAnsweredQuestions({});
                    setCurrentQuestionIndex(0);
                    setShowQuizResult(false);
                    setShowQuizReview(false);
                    generateQuiz();
                  }}
                  disabled={isGeneratingQuiz}
                  className="flex-1"
                >
                  {isGeneratingQuiz ? (
                    <>
                      <Loader2 className="size-4 mr-2 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <BookOpen className="size-4 mr-2" />
                      Generate Quiz
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}