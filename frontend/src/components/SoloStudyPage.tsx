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
}

interface SoloStudyPageProps {
  initialSessionId?: string | null;
  onSessionsChange?: () => void;
}

export function SoloStudyPage({ initialSessionId, onSessionsChange }: SoloStudyPageProps) {
  const [mode, setMode] = useState<'teach' | 'student'>('student');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [currentSession, setCurrentSession] = useState<Session | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [uploadedFiles, setUploadedFiles] = useState<FileData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessingVoice, setIsProcessingVoice] = useState(false);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

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
          setMessages([]);
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
            
            // Convert chat history to messages format
            if (data.session.chatHistory) {
              const convertedMessages: Message[] = data.session.chatHistory.map((msg: any) => ({
                role: msg.role === 'assistant' ? 'ai' : msg.role,
                content: msg.content
              }));
              setMessages(convertedMessages);
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
        setMessages([]);
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
        
        // Convert chat history
        if (data.session.chatHistory) {
          const convertedMessages: Message[] = data.session.chatHistory.map((msg: any) => ({
            role: msg.role === 'assistant' ? 'ai' : msg.role,
            content: msg.content
          }));
          setMessages(convertedMessages);
        } else {
          setMessages([]);
        }

        toast.success('Session loaded!');
      }
    } catch (error) {
      console.error('Failed to load session:', error);
      toast.error('Failed to load session');
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

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
      // Clear the file input
      e.target.value = '';
    }
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
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">AI Study Assistant</h1>
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            onClick={createNewSession}
            disabled={isLoading || isUploading}
          >
            <Plus className="size-4 mr-2" />
            New Study
          </Button>
        </div>
      </div>

      {/* Current Session Info */}
      {currentSession && (
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="py-3 px-4">
            <div className="flex justify-between items-center">
              <p className="text-sm font-medium">
                Current Session: {currentSession.name}
              </p>
              <p className="text-xs text-muted-foreground">
                {uploadedFiles.length}/3 files
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* File Upload Area */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle className="text-lg">Study Materials ({uploadedFiles.length}/3)</CardTitle>
            <label htmlFor="file-upload">
              <Button 
                variant="outline" 
                size="sm" 
                asChild 
                disabled={isUploading || uploadedFiles.length >= 3}
              >
                <span className="cursor-pointer">
                  {isUploading ? (
                    <>
                      <Loader2 className="size-4 mr-2 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="size-4 mr-2" />
                      Upload File
                    </>
                  )}
                </span>
              </Button>
            </label>
            <input
              id="file-upload"
              type="file"
              accept=".pdf,.txt,.md,.png,.jpg,.jpeg,.gif,.webp,.mp3,.wav,.m4a,.mp4,.webm,text/plain,application/pdf,image/*,audio/*"
              className="hidden"
              onChange={handleFileUpload}
              disabled={isUploading || uploadedFiles.length >= 3}
            />
          </div>
        </CardHeader>
        <CardContent>
          {uploadedFiles.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="size-12 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No files uploaded yet. Upload up to 3 files to get started!</p>
            </div>
          ) : (
            <div className="space-y-2">
              {uploadedFiles.map((file) => (
                <div
                  key={file.id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border"
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

      <Tabs value={mode} onValueChange={(v) => setMode(v as 'teach' | 'student')}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="student">
            <BookOpen className="size-4 mr-2" />
            Student Mode
          </TabsTrigger>
          <TabsTrigger value="teach">
            <GraduationCap className="size-4 mr-2" />
            Teach Mode
          </TabsTrigger>
        </TabsList>

        <TabsContent value="student" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">AI Teaches You</CardTitle>
              <p className="text-sm text-muted-foreground">
                The AI will explain concepts and quiz you on the material
              </p>
            </CardHeader>
          </Card>
        </TabsContent>

        <TabsContent value="teach" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">You Teach the AI</CardTitle>
              <p className="text-sm text-muted-foreground">
                Explain the concept to the AI and receive feedback on your understanding
              </p>
            </CardHeader>
          </Card>
        </TabsContent>
      </Tabs>

      <Card className="min-h-[400px] flex flex-col">
        <CardHeader>
          <CardTitle>Chat</CardTitle>
        </CardHeader>
        <CardContent className="flex-1 flex flex-col">
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
                    className={`max-w-[80%] rounded-lg px-4 py-2 ${
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
                <div className="max-w-[80%] rounded-lg px-4 py-2 bg-gray-100 text-gray-900">
                  <div className="flex items-center gap-2">
                    <Loader2 className="size-4 animate-spin" />
                    <p className="text-sm">AI is thinking...</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <Textarea
              placeholder={
                mode === 'teach'
                  ? "Explain the concept in your own words..."
                  : "Ask a question about your study material..."
              }
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              className="flex-1"
              rows={3}
              disabled={isRecording || isProcessingVoice}
            />
            <div className="flex flex-col gap-2 self-end">
              <Button 
                onClick={handleSendMessage} 
                disabled={isLoading || !input.trim() || isRecording || isProcessingVoice}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="size-4 mr-2 animate-spin" />
                    Sending...
                  </>
                ) : (
                  'Send'
                )}
              </Button>
              <Button 
                onClick={handleVoiceClick}
                variant={isRecording ? "destructive" : "outline"}
                disabled={isLoading || isProcessingVoice}
              >
                {isProcessingVoice ? (
                  <>
                    <Loader2 className="size-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : isRecording ? (
                  <>
                    <MicOff className="size-4 mr-2" />
                    Stop
                  </>
                ) : (
                  <>
                    <Mic className="size-4 mr-2" />
                    Voice
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-blue-50 border-blue-200">
        <CardContent className="py-3 px-4">
          <p className="text-sm text-blue-900">
            <strong>Tip:</strong> Upload your study materials (PDF, TXT, Images, Audio) and the AI will help you understand the content. 
            Use the <strong>Voice</strong> button to ask questions by speaking! The AI will respond with both text and voice.
            In Student Mode, ask questions about the material. In Teach Mode, explain concepts and get feedback!
          </p>
        </CardContent>
      </Card>
    </div>
  );
}