import { useState, useEffect, useRef } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Textarea } from './ui/textarea';
import { Upload, BookOpen, GraduationCap, Loader2, Mic, MicOff } from 'lucide-react';
import { toast } from 'sonner';
import { apiBase } from '../utils/api';

interface Message {
  role: 'user' | 'ai';
  content: string;
}

export function SoloStudyPage() {
  const [mode, setMode] = useState<'teach' | 'student'>('student');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [uploadedFile, setUploadedFile] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessingVoice, setIsProcessingVoice] = useState(false);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Load active material on mount
  useEffect(() => {
    const loadActiveMaterial = async () => {
      try {
        const token = localStorage.getItem('accessToken');
        if (!token) return;

        const response = await fetch(`${apiBase}/ai/material`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        if (response.ok) {
          const data = await response.json();
          if (data.material) {
            setUploadedFile(data.material.fileName);
          }
        }
      } catch (error) {
        console.error('Failed to load material:', error);
      }
    };

    loadActiveMaterial();
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);

    try {
      const token = localStorage.getItem('accessToken');
      if (!token) {
        toast.error('Please login first');
        return;
      }

      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`${apiBase}/ai/upload`, {
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
      setUploadedFile(data.fileName);
      toast.success(`Uploaded: ${data.fileName}`);
      
      // Clear previous messages when new material is uploaded
      setMessages([]);
    } catch (error) {
      console.error('Upload error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to upload file');
    } finally {
      setIsUploading(false);
    }
  };

  const handleSendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = { role: 'user', content: input };
    setMessages([...messages, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const token = localStorage.getItem('accessToken');
      if (!token) {
        toast.error('Please login first');
        setIsLoading(false);
        return;
      }

      const response = await fetch(`${apiBase}/ai/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          message: input,
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

      const formData = new FormData();
      formData.append('audio', audioBlob, 'recording.webm');
      formData.append('mode', mode);

      const response = await fetch(`${apiBase}/ai/voice-chat`, {
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
          <label htmlFor="file-upload">
            <Button variant="outline" asChild disabled={isUploading}>
              <span className="cursor-pointer">
                {isUploading ? (
                  <>
                    <Loader2 className="size-4 mr-2 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="size-4 mr-2" />
                    Upload Materials
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
            disabled={isUploading}
          />
        </div>
      </div>

      {uploadedFile && (
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="py-3 px-4">
            <p className="text-sm">
              <span className="font-medium">Active Material:</span> {uploadedFile}
            </p>
          </CardContent>
        </Card>
      )}

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