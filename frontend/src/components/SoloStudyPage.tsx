import { useState } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Textarea } from './ui/textarea';
import { Upload, BookOpen, GraduationCap } from 'lucide-react';
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

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadedFile(file.name);
      toast.success(`Uploaded: ${file.name}`);
    }
  };

  const handleSendMessage = () => {
    if (!input.trim()) return;

    const userMessage: Message = { role: 'user', content: input };
    setMessages([...messages, userMessage]);

    // Mock AI response
    setTimeout(() => {
      let aiResponse = '';
      
      if (mode === 'teach') {
        aiResponse = "That's a good explanation! However, I noticed a few points that could be improved:\n\n1. Consider explaining the core concept more clearly\n2. Try to provide a concrete example\n3. Break down complex ideas into simpler steps\n\nOverall understanding: 7/10. Keep practicing!";
      } else {
        aiResponse = "Let me help you understand this concept:\n\nThe main idea is that when we study this topic, we need to focus on three key principles:\n\n1. Foundation - Understanding the basics\n2. Application - How to use it in practice\n3. Analysis - Why it works this way\n\nWould you like me to quiz you on this material?";
      }

      const aiMessage: Message = { role: 'ai', content: aiResponse };
      setMessages(prev => [...prev, aiMessage]);
    }, 1000);

    setInput('');
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">AI Study Assistant</h1>
        <div className="flex items-center gap-2">
          <label htmlFor="file-upload">
            <Button variant="outline" asChild>
              <span className="cursor-pointer">
                <Upload className="size-4 mr-2" />
                Upload Materials
              </span>
            </Button>
          </label>
          <input
            id="file-upload"
            type="file"
            accept=".pdf,.doc,.docx,.txt"
            className="hidden"
            onChange={handleFileUpload}
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
            />
            <Button onClick={handleSendMessage} className="self-end">
              Send
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-amber-50 border-amber-200">
        <CardContent className="py-3 px-4">
          <p className="text-sm text-amber-900">
            <strong>Note:</strong> This is a prototype AI assistant. Responses are simulated for demonstration purposes.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}