import { useState, useEffect, useRef, useMemo } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './ui/alert-dialog';
import { DoorOpen, Users, Upload, BookOpen, Loader2, CheckCircle, XCircle, HelpCircle, FileText, Video } from 'lucide-react';
import { apiBase } from '../utils/api';
import { toast } from 'sonner';
import { getMedalEmoji } from '../utils/medal';

interface Participant {
  id: string;
  username: string;
  medal?: string | null;
}

interface Group {
  id: string;
  topic: string;
  location: string;
  date: string;
  time: string;
  maxParticipants: number;
  participants?: string[];
  participantsWithNames?: Participant[];
  meetingId?: string;
  studyType?: string;
  duration?: string;
}

interface StudyRoomPageProps {
  groupId: string;
  accessToken: string;
  currentUserId: string;
  onBack: () => void;
  onLeaveRoom?: () => void;
  onJoinMeeting?: (meetingId: string) => void;
  onStartAiReview?: (sessionId: string) => void;
}

interface UploadedFile {
  id: string;
  fileName: string;
  fileType: string;
  uploadedAt: string;
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

interface QuizResult {
  questionId: number;
  question: string;
  options: string[];
  correctAnswer: number;
  explanation: string;
  correctCount: number;
  incorrectCount: number;
  unansweredCount: number;
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const buildWsUrl = (token: string) => {
  const base = apiBase.replace(/^http/, 'ws');
  return `${base}/ws?token=${encodeURIComponent(token)}`;
};

interface RoomMessage {
  id: string;
  clientId?: string | null;
  roomId: string;
  senderId: string;
  senderName: string;
  content: string;
  createdAt: string;
  pending?: boolean;
}

export function StudyRoomPage({
  groupId,
  accessToken,
  currentUserId,
  onBack,
  onLeaveRoom,
  onJoinMeeting,
  onStartAiReview,
}: StudyRoomPageProps) {
  const glassPanelClass =
    'bg-white/80 backdrop-blur border border-white/70 shadow-[0_16px_40px_rgba(15,23,42,0.10)]';
  const [group, setGroup] = useState<Group | null>(null);
  const [loading, setLoading] = useState(true);
  const [presence, setPresence] = useState<Participant[]>([]);
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);
  const joinedRef = useRef(false);
  const [chatMessages, setChatMessages] = useState<RoomMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [socketReady, setSocketReady] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const chatAutoScrollRef = useRef(true);
  const socketRef = useRef<WebSocket | null>(null);
  const [joinBlocked, setJoinBlocked] = useState(false);
  const [canJoinRoom, setCanJoinRoom] = useState(false);

  // Group Quiz States
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [quiz, setQuiz] = useState<QuizData | null>(null);
  const [isGeneratingQuiz, setIsGeneratingQuiz] = useState(false);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState<{ [key: number]: number }>({});
  const [showResults, setShowResults] = useState(false);
  const [quizResults, setQuizResults] = useState<QuizResult[]>([]);
  const [showQuizSettings, setShowQuizSettings] = useState(false);
  const [quizCount, setQuizCount] = useState(25);
  const [quizDifficulty, setQuizDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [showQuizCompleted, setShowQuizCompleted] = useState(false);
  const [isCreatingAiReview, setIsCreatingAiReview] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [completionStatus, setCompletionStatus] = useState<{ completed: number; total: number; allCompleted: boolean }>({ completed: 0, total: 0, allCompleted: false });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isReviewMode, setIsReviewMode] = useState(false);
  
  // Personal Timer States
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [timerStartTime, setTimerStartTime] = useState<number | null>(null);

  // Check if study time has started
  const isStudyTime = useMemo(() => {
    if (!group?.date || !group?.time) return false;
    const meetingDateTime = new Date(`${group.date}T${group.time}`);
    return currentTime >= meetingDateTime;
  }, [group, currentTime]);

  // Timer interval
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    if (isTimerRunning && timerStartTime) {
      interval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - timerStartTime) / 1000);
        setTimerSeconds(elapsed);
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isTimerRunning, timerStartTime]);

  // Fetch room details (UI display only - no permission checking)
  useEffect(() => {
    let cancelled = false;
    
    const fetchGroup = async () => {
      try {
        console.log('[StudyRoomPage] fetchGroup start', { groupId });
        const res = await fetch(`${apiBase}/study-groups/${groupId}`, {
          headers: auth(accessToken),
        });
        console.log('[StudyRoomPage] fetchGroup res status', res.status);
        const data = await res.json();
        console.log('[StudyRoomPage] fetchGroup data', data);
        if (!cancelled && data.group) {
          setGroup(data.group);
          setLoading(false);
        }
      } catch (e) {
        if (!cancelled) console.error('Failed to fetch room', e);
        if (!cancelled) setLoading(false);
      }
    };
    
    fetchGroup();
    return () => { cancelled = true; };
  }, [groupId, accessToken]);

  // Join presence - server decides permission (single source of truth)
  useEffect(() => {
    if (!group) return; // Wait for group to load
    
    let cancelled = false;
    let retryCount = 0;
    const maxRetries = 1; // Allow one retry for auto-add logic
    
    const tryJoinPresence = async () => {
      try {
        console.log('[StudyRoomPage] trying to join presence', { groupId, retryCount, joinBlocked });
        
        const res = await fetch(`${apiBase}/study-groups/${groupId}/presence`, {
          method: 'POST',
          headers: { ...auth(accessToken), 'Content-Type': 'application/json' },
        });
        console.log('[StudyRoomPage] presence POST status', res.status);
        
        if (!res.ok) {
          if (res.status === 403) {
            // Server says "Not accepted"
            if (retryCount < maxRetries && !joinBlocked) {
              // Retry once (server might auto-add on second attempt)
              retryCount++;
              setTimeout(() => {
                if (!cancelled) tryJoinPresence();
              }, 500);
              return;
            }
            // After retry or already blocked, show error
            if (!cancelled) {
              setJoinBlocked(true);
              setCanJoinRoom(false);
              toast.error('You need to be accepted to join this room.');
            }
            return;
          }
          // Other errors
          if (!cancelled) {
            console.error('[StudyRoomPage] presence POST failed', res.status);
          }
          return;
        }
        
        // Success - server confirmed user can join
        if (res.ok && !cancelled) {
          console.log('[StudyRoomPage] presence POST succeeded - user can join');
          joinedRef.current = true;
          setJoinBlocked(false); // Clear any previous block
          setCanJoinRoom(true);
        }
      } catch (e) {
        if (!cancelled) console.error('Failed to join presence', e);
      }
    };
    
    // Always let server decide; we already cap retries inside
    tryJoinPresence();
    
    return () => { cancelled = true; };
  }, [groupId, accessToken, group]);

  // Fetch room chat history (only when server allowed)
  useEffect(() => {
    if (!canJoinRoom) return;
    if (!group) return;
    if (group.meetingId) return; // Online rooms: no room chat
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${apiBase}/study-groups/${groupId}/chat`, {
          headers: auth(accessToken),
        });
        const data = await res.json();
        if (!cancelled) setChatMessages(data.messages || []);
      } catch (e) {
        if (!cancelled) console.error('Failed to fetch room chat', e);
      }
    })();
    return () => { cancelled = true; };
  }, [groupId, accessToken, canJoinRoom, group?.meetingId, group]);

  // Load quiz files
  useEffect(() => {
    loadQuizFiles();
  }, [groupId, accessToken]);

  // Load quiz if exists
  useEffect(() => {
    loadQuiz();
  }, [groupId, accessToken]);

  // Save quiz progress to localStorage
  useEffect(() => {
    if (quiz && Object.keys(userAnswers).length > 0) {
      const progress = {
        currentQuestionIndex,
        userAnswers,
      };
      localStorage.setItem(`quiz-progress-${groupId}-${currentUserId}`, JSON.stringify(progress));
    }
  }, [currentQuestionIndex, userAnswers, groupId, currentUserId, quiz]);

  // Check if quiz is completed
  useEffect(() => {
    if (quiz && quiz.questions) {
      const totalQuestions = quiz.questions.length;
      const answeredQuestions = Object.keys(userAnswers).length;
      
      if (answeredQuestions === totalQuestions && answeredQuestions > 0) {
        setShowQuizCompleted(true);
      } else {
        setShowQuizCompleted(false);
      }
    }
  }, [quiz, userAnswers]);

  // Update current time every minute to check study start time
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000); // Update every minute

    return () => clearInterval(interval);
  }, []);

  // Poll completion status when quiz exists
  useEffect(() => {
    if (!quiz) return;
    if (!group) return;
    if (!(isStudyTime || Boolean(group.meetingId))) return;

    const fetchCompletionStatus = async () => {
      try {
        const res = await fetch(`${apiBase}/study-groups/${groupId}/quiz/completion`, {
          headers: auth(accessToken),
        });
        const data = await res.json();
        setCompletionStatus(data);
      } catch (e) {
        console.error('Failed to fetch completion status', e);
      }
    };

    fetchCompletionStatus();
    const interval = setInterval(fetchCompletionStatus, 2000); // Poll every 2 seconds

    return () => clearInterval(interval);
  }, [quiz, isStudyTime, groupId, accessToken, group?.meetingId, group]);

  // WebSocket: join room + receive messages (only when server allowed)
  useEffect(() => {
    if (!canJoinRoom) return;
    if (!group) return;
    if (group.meetingId) return; // Online rooms: no room chat
    const socket = new WebSocket(buildWsUrl(accessToken));
    socketRef.current = socket;
    setSocketReady(false);

    socket.onopen = () => {
      console.log('[StudyRoomPage] WebSocket opened, sending room:join', groupId);
      setSocketReady(true);
      socket.send(JSON.stringify({ type: 'room:join', roomId: groupId }));
    };

    socket.onclose = () => {
      console.log('[StudyRoomPage] WebSocket closed');
      setSocketReady(false);
    };

    socket.onerror = (error) => {
      console.error('[StudyRoomPage] WebSocket error', error);
    };

    socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        console.log('[StudyRoomPage] WebSocket message received', payload.type);
        if (payload?.type === 'room:error') {
          console.error('[StudyRoomPage] room:error', payload.message);
          toast.error(payload.message || 'Unable to join room');
          return;
        }
        if (payload?.type !== 'room:message' || !payload?.message) return;
        const message = payload.message as RoomMessage;
        if (message.roomId !== groupId) return;
        console.log('[StudyRoomPage] room:message received', message);
        setChatMessages((prev) => {
          if (message.clientId) {
            const index = prev.findIndex((item) => item.clientId === message.clientId);
            if (index !== -1) {
              const next = [...prev];
              next[index] = { ...message, pending: false };
              return next;
            }
          }
          return [...prev, message];
        });
      } catch (error) {
        console.error('Failed to parse room chat message:', error);
      }
    };

    return () => {
      try {
        socket.send(JSON.stringify({ type: 'room:leave', roomId: groupId }));
      } catch (_) {}
      socket.close();
      socketRef.current = null;
    };
  }, [groupId, accessToken, canJoinRoom, group?.meetingId, group]);

  useEffect(() => {
    if (!group) return;
    if (group.meetingId) return; // Online rooms: no room chat
    const container = chatScrollRef.current;
    if (!container) return;
    if (chatAutoScrollRef.current) {
      container.scrollTop = container.scrollHeight;
    }
  }, [chatMessages, group?.meetingId, group]);

  // Poll presence list
  useEffect(() => {
    if (joinBlocked) return;
    const fetchPresence = async () => {
      try {
        const res = await fetch(`${apiBase}/study-groups/${groupId}/presence`, {
          headers: auth(accessToken),
        });
        const data = await res.json();
        if (data.presence) setPresence(data.presence);
      } catch (e) {
        // ignore
      }
    };
    fetchPresence();
    const interval = setInterval(fetchPresence, 2000);
    return () => clearInterval(interval);
  }, [groupId, accessToken, joinBlocked]);

  const loadQuizFiles = async () => {
    try {
      const res = await fetch(`${apiBase}/study-groups/${groupId}/quiz/files`, {
        headers: auth(accessToken),
      });
      const data = await res.json();
      setUploadedFiles(data.files || []);
    } catch (e) {
      console.error('Failed to load quiz files', e);
    }
  };

  const loadQuiz = async () => {
    try {
      const res = await fetch(`${apiBase}/study-groups/${groupId}/quiz`, {
        headers: auth(accessToken),
      });
      const data = await res.json();
      if (data.quiz) {
        setQuiz(data.quiz);
        
        // Restore quiz progress from localStorage
        const savedProgress = localStorage.getItem(`quiz-progress-${groupId}-${currentUserId}`);
        if (savedProgress) {
          try {
            const progress = JSON.parse(savedProgress);
            setCurrentQuestionIndex(progress.currentQuestionIndex || 0);
            const restoredAnswers = progress.userAnswers || {};
            setUserAnswers(restoredAnswers);
            
            // Sync restored answers to backend
            for (const [questionIdStr, answer] of Object.entries(restoredAnswers)) {
              const questionId = parseInt(questionIdStr);
              try {
                await fetch(`${apiBase}/study-groups/${groupId}/quiz/answer`, {
                  method: 'POST',
                  headers: {
                    ...auth(accessToken),
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({ questionId, answer }),
                });
              } catch (syncError) {
                console.error('Failed to sync answer to backend:', syncError);
              }
            }
          } catch (e) {
            console.error('Failed to parse saved progress', e);
          }
        }
      }
    } catch (e) {
      console.error('Failed to load quiz', e);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch(`${apiBase}/study-groups/${groupId}/quiz/upload`, {
        method: 'POST',
        headers: auth(accessToken),
        body: formData,
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Upload failed');
      }

      const data = await res.json();
      toast.success(`File uploaded! (${data.fileCount}/${data.maxFiles})`);
      await loadQuizFiles();
    } catch (error) {
      console.error('Upload error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to upload file');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleGenerateQuiz = async () => {
    setIsGeneratingQuiz(true);
    setShowQuizSettings(false);

    try {
      const res = await fetch(`${apiBase}/study-groups/${groupId}/quiz/generate`, {
        method: 'POST',
        headers: {
          ...auth(accessToken),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          count: quizCount,
          difficulty: quizDifficulty,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to generate quiz');
      }

      const data = await res.json();
      setQuiz(data.quiz);
      setUserAnswers({});
      setCurrentQuestionIndex(0);
      setShowResults(false);
      setShowQuizCompleted(false);
      
      // Clear saved progress for new quiz
      localStorage.removeItem(`quiz-progress-${groupId}-${currentUserId}`);
      
      toast.success('Quiz generated!');
    } catch (error) {
      console.error('Generate quiz error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to generate quiz');
    } finally {
      setIsGeneratingQuiz(false);
    }
  };

  const handleAnswerQuestion = async (questionId: number, answer: number) => {
    setUserAnswers((prev) => ({ ...prev, [questionId]: answer }));

    try {
      await fetch(`${apiBase}/study-groups/${groupId}/quiz/answer`, {
        method: 'POST',
        headers: {
          ...auth(accessToken),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ questionId, answer }),
      });
    } catch (error) {
      console.error('Submit answer error:', error);
    }
  };

  const handleViewResults = async () => {
    try {
      const res = await fetch(`${apiBase}/study-groups/${groupId}/quiz/results`, {
        headers: auth(accessToken),
      });
      const data = await res.json();
      setQuizResults(data.results || []);
      setShowResults(true);
    } catch (error) {
      console.error('Get results error:', error);
      toast.error('Failed to load results');
    }
  };

  const handleStartAiReview = async () => {
    setIsCreatingAiReview(true);
    try {
      const res = await fetch(`${apiBase}/study-groups/${groupId}/quiz/review-session`, {
        method: 'POST',
        headers: auth(accessToken),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success || !data?.sessionId) {
        throw new Error(String(data?.error || 'Failed to create AI review session'));
      }
      toast.success('AI review session created. Opening AI Study...');
      if (onStartAiReview) {
        onStartAiReview(String(data.sessionId));
      } else {
        window.location.hash = 'solo-study';
      }
    } catch (error) {
      console.error('Create AI review session error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to create AI review session');
    } finally {
      setIsCreatingAiReview(false);
    }
  };

  const startRoomTimer = async () => {
    try {
      await fetch(`${apiBase}/study/timer/start`, {
        method: 'POST',
        headers: {
          ...auth(accessToken),
          'Content-Type': 'application/json',
        },
      });
      setIsTimerRunning(true);
      setTimerStartTime(Date.now());
      setTimerSeconds(0);
      toast.success('⏱️ Timer started!');
    } catch (error) {
      console.error('Failed to start timer:', error);
      toast.error('Failed to start timer');
    }
  };

  const stopRoomTimer = async () => {
    if (!isTimerRunning) return;
    
    try {
      const response = await fetch(`${apiBase}/study/timer/stop`, {
        method: 'POST',
        headers: {
          ...auth(accessToken),
          'Content-Type': 'application/json',
        },
      });
      const data = await response.json();
      
      setIsTimerRunning(false);
      setTimerStartTime(null);
      setTimerSeconds(0);
      
      // Show medal unlock notification if any
      if (data.newlyUnlocked && data.newlyUnlocked.length > 0) {
        for (const medal of data.newlyUnlocked) {
          const medalEmoji = medal === 'bronze' ? '🥉' : medal === 'silver' ? '🥈' : '🥇';
          toast.success(`${medalEmoji} Unlocked ${medal.toUpperCase()} medal!`);
        }
      }
      
      toast.success(`⏱️ Timer stopped! Logged ${data.elapsedMinutes} minutes`);
    } catch (error) {
      console.error('Failed to stop timer:', error);
      toast.error('Failed to stop timer');
    }
  };

  const handleLeaveRoom = async () => {
    // Stop timer if running before leaving
    if (isTimerRunning) {
      await stopRoomTimer();
    }
    
    setLeaveDialogOpen(false);
    if (joinedRef.current) {
      try {
        await fetch(`${apiBase}/study-groups/${groupId}/presence`, {
          method: 'DELETE',
          headers: auth(accessToken),
        });
      } catch (_) {}
      joinedRef.current = false;
    }
    onLeaveRoom?.();
    onBack();
  };

  const handleSendMessage = () => {
    if (!chatInput.trim() || !socketRef.current || !socketReady) {
      console.log('[StudyRoomPage] handleSendMessage blocked', { 
        hasInput: !!chatInput.trim(), 
        socketReady, 
        hasSocket: !!socketRef.current 
      });
      return;
    }
    const clientId = crypto.randomUUID();
    const content = chatInput.trim();
    console.log('[StudyRoomPage] sending message', { roomId: groupId, content });
    const tempMessage: RoomMessage = {
      id: clientId,
      clientId,
      roomId: groupId,
      senderId: currentUserId,
      senderName: 'You',
      content,
      createdAt: new Date().toISOString(),
      pending: true,
    };
    setChatMessages((prev) => [...prev, tempMessage]);
    socketRef.current.send(
      JSON.stringify({
        type: 'room:send',
        roomId: groupId,
        content,
        clientId,
      })
    );
    setChatInput('');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <p className="text-muted-foreground">Loading room...</p>
      </div>
    );
  }

  if (!group) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-2">
          <DoorOpen className="size-4" />
          Leave room
        </Button>
        <p className="text-muted-foreground">Room not found.</p>
      </div>
    );
  }

  const currentQuestion = quiz?.questions[currentQuestionIndex];
  const isOnlineRoom = Boolean(group.meetingId);
  const showQuizPanel = isOnlineRoom || isStudyTime;
  const mapQuery = group ? encodeURIComponent(group.location) : '';
  const mapSrc = `https://www.google.com/maps?q=${mapQuery}&output=embed`;

  const openZoomFloating = () => {
    if (!group?.meetingId) return;
    if (!onJoinMeeting) {
      // Fallback: go to the meeting page
      window.location.hash = `meeting-${group.meetingId}`;
      return;
    }
    onJoinMeeting(group.meetingId);
  };

  return (
    <div className="rounded-[28px] bg-white/60 shadow-[0_30px_80px_rgba(15,23,42,0.08)] p-6 h-[720px] overflow-y-auto space-y-4">
      <div className="flex items-center gap-4">
        {isOnlineRoom && (
          <Button onClick={openZoomFloating} size="sm" className="bg-blue-600 hover:bg-blue-700 gap-2">
            <Video className="size-4" />
            Open Zoom
          </Button>
        )}
        <AlertDialog open={leaveDialogOpen} onOpenChange={setLeaveDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Leave room?</AlertDialogTitle>
              <AlertDialogDescription>
                You will give up your seat and be removed from the participant list. You can re-join if there are seats left.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleLeaveRoom} className="bg-red-600 hover:bg-red-700">
                Leave room
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left: Map/Meeting Info or Group Quiz */}
        {!showQuizPanel ? (
          /* Before Study Time - Show Map + Meeting Info (in-person only) */
          <div className="lg:col-span-2 space-y-4">
            <div className="rounded-lg overflow-hidden border bg-gray-100 h-[520px] min-h-[280px]">
              <iframe
                title="Meeting location"
                src={mapSrc}
                className="w-full h-full"
                style={{ border: 0 }}
                allowFullScreen
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </div>
            {group && !group.meetingId && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg">Meeting Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-start gap-2 text-sm">
                    <BookOpen className="size-4 mt-0.5 flex-shrink-0 text-muted-foreground" />
                    <span><strong>Topic:</strong> {group.topic}</span>
                  </div>
                  <div className="flex items-start gap-2 text-sm">
                    <Users className="size-4 mt-0.5 flex-shrink-0 text-muted-foreground" />
                    <span><strong>Location:</strong> {group.location}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">📅</span>
                    <span><strong>Date:</strong> {group.date}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">🕐</span>
                    <span><strong>Time:</strong> {group.time || '—'}</span>
                  </div>
                  <div className="text-sm text-muted-foreground pt-2 border-t">
                    {(group.participantsWithNames ?? []).length} / {group.maxParticipants} participants
                  </div>
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mt-4">
                    <p className="text-sm text-blue-900">
                      <strong>💡 Quiz will be available at {group.time}</strong>
                    </p>
                    <p className="text-xs text-blue-700 mt-1">
                      Review the location and prepare your study materials!
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        ) : (
          /* After Study Time - Show Group Quiz */
          <div className={`lg:col-span-2 rounded-2xl ${glassPanelClass} h-[520px] min-h-[280px] flex flex-col`}>
            {showQuizCompleted && !showResults ? (
            /* Quiz Completed View */
            <div className="flex-1 flex items-center justify-center p-6">
              <div className="text-center max-w-md">
                <div className="mb-6">
                  <div className="text-6xl mb-4">🎉</div>
                  <h3 className="text-3xl font-bold mb-2 text-teal-600">Quiz Completed!</h3>
                  <p className="text-muted-foreground">
                    You've answered all {quiz?.questions.length} questions!
                  </p>
                </div>

                {/* Completion Progress */}
                {!completionStatus.allCompleted && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                    <div className="flex items-center justify-center gap-2 mb-2">
                      <Loader2 className="size-5 text-blue-600 animate-spin" />
                      <p className="text-sm font-semibold text-blue-900">
                        Waiting for others...
                      </p>
                    </div>
                    <p className="text-lg font-bold text-blue-700">
                      {completionStatus.completed} / {completionStatus.total} completed
                    </p>
                    <p className="text-xs text-blue-600 mt-2">
                      Results will be available when everyone finishes
                    </p>
                  </div>
                )}

                {completionStatus.allCompleted && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
                    <p className="text-sm font-semibold text-green-900">
                      ✓ Everyone has completed the quiz!
                    </p>
                  </div>
                )}

                <div className="space-y-3">
                  <Button
                    variant="secondary"
                    onClick={handleStartAiReview}
                    size="lg"
                    className="w-full"
                    disabled={isCreatingAiReview}
                  >
                    {isCreatingAiReview ? (
                      <>
                        <Loader2 className="size-5 mr-2 animate-spin" />
                        Creating AI Review...
                      </>
                    ) : (
                      <>
                        <BookOpen className="size-5 mr-2" />
                        Start AI Review
                      </>
                    )}
                  </Button>
                  <Button
                    onClick={handleViewResults}
                    size="lg"
                    className="w-full"
                    disabled={!completionStatus.allCompleted}
                  >
                    <BookOpen className="size-5 mr-2" />
                    View Results
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowQuizCompleted(false);
                      setCurrentQuestionIndex(0);
                      setIsReviewMode(true);
                    }}
                    className="w-full"
                  >
                    Review Quiz
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setShowQuizSettings(true)}
                    className="w-full"
                  >
                    Start New Quiz
                  </Button>
                </div>
              </div>
            </div>
          ) : showResults ? (
            /* Results View */
            <div className="flex-1 flex flex-col p-6 overflow-y-auto">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold">Quiz Results</h3>
                <Button variant="outline" onClick={() => setShowResults(false)}>
                  Back to Quiz
                </Button>
              </div>
              
              <div className="space-y-6">
                {quizResults.map((result, idx) => (
                  <Card key={result.questionId} className="border-2">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">
                        Q{idx + 1}. {result.question}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="space-y-1">
                        {result.options.map((option, optIdx) => (
                          <div
                            key={optIdx}
                            className={`p-2 rounded text-sm ${
                              optIdx === result.correctAnswer
                                ? 'bg-green-50 border border-green-500 font-semibold'
                                : 'bg-gray-50'
                            }`}
                          >
                            {String.fromCharCode(65 + optIdx)}. {option}
                            {optIdx === result.correctAnswer && ' ✓'}
                          </div>
                        ))}
                      </div>
                      
                      <div className="bg-blue-50 p-3 rounded">
                        <p className="text-xs font-semibold text-blue-900 mb-1">Explanation:</p>
                        <p className="text-sm text-gray-700">{result.explanation}</p>
                      </div>

                      <div className="flex gap-4 text-sm font-medium pt-2 border-t">
                        <div className="flex items-center gap-2 text-green-700">
                          <CheckCircle className="size-4" />
                          <span>{result.correctCount} Correct</span>
                        </div>
                        <div className="flex items-center gap-2 text-red-700">
                          <XCircle className="size-4" />
                          <span>{result.incorrectCount} Wrong</span>
                        </div>
                        <div className="flex items-center gap-2 text-gray-500">
                          <HelpCircle className="size-4" />
                          <span>{result.unansweredCount} Unanswered</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <div className="mt-6 pt-6 border-t text-center">
                <div className="flex items-center justify-center gap-3">
                  <Button
                    variant="secondary"
                    onClick={handleStartAiReview}
                    size="lg"
                    disabled={isCreatingAiReview}
                  >
                    {isCreatingAiReview ? (
                      <>
                        <Loader2 className="size-5 mr-2 animate-spin" />
                        Creating AI Review...
                      </>
                    ) : (
                      <>
                        <BookOpen className="size-5 mr-2" />
                        Start AI Review
                      </>
                    )}
                  </Button>
                  <Button onClick={() => setShowQuizSettings(true)} size="lg">
                    <BookOpen className="size-5 mr-2" />
                    Start New Quiz
                  </Button>
                </div>
              </div>
            </div>
          ) : quiz ? (
            /* Quiz View */
            <div className="flex-1 flex flex-col p-6">
              <div className="mb-4 flex items-center justify-between pb-4 border-b">
                <h3 className="text-lg font-bold">{isReviewMode ? 'Review Quiz' : 'Group Quiz'}</h3>
                <div className="flex items-center gap-4">
                  <span className="text-sm text-muted-foreground">
                    Question {currentQuestionIndex + 1} / {quiz.questions.length}
                  </span>
                  {!isReviewMode && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleViewResults}
                      disabled={!completionStatus.allCompleted}
                      title={!completionStatus.allCompleted ? `Waiting for others (${completionStatus.completed}/${completionStatus.total} completed)` : 'View results'}
                    >
                      View Results
                    </Button>
                  )}
                  {isReviewMode && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setIsReviewMode(false);
                        setShowQuizCompleted(true);
                      }}
                    >
                      Exit Review
                    </Button>
                  )}
                </div>
              </div>

              {currentQuestion && (
                <div className="flex-1 flex flex-col space-y-6">
                  <div>
                    <h4 className="text-xl font-semibold mb-4">
                      {currentQuestion.question}
                    </h4>

                    <div className="space-y-3">
                      {currentQuestion.options.map((option, idx) => {
                        const isSelected = userAnswers[currentQuestion.id] === idx;
                        const isCorrect = idx === currentQuestion.correctAnswer;
                        const isWrong = isReviewMode && isSelected && !isCorrect;
                        
                        let buttonClass = 'w-full p-4 text-left rounded-lg border-2 transition-all ';
                        if (isReviewMode) {
                          if (isCorrect) {
                            buttonClass += 'border-green-500 bg-green-50 ';
                          } else if (isWrong) {
                            buttonClass += 'border-red-500 bg-red-50 ';
                          } else {
                            buttonClass += 'border-gray-200 bg-gray-50 ';
                          }
                        } else {
                          buttonClass += isSelected
                            ? 'border-teal-500 bg-teal-50 '
                            : 'border-gray-200 hover:border-teal-300 hover:bg-gray-50 ';
                        }
                        
                        return (
                          <button
                            key={idx}
                            onClick={() => !isReviewMode && handleAnswerQuestion(currentQuestion.id, idx)}
                            disabled={isReviewMode}
                            className={buttonClass}
                          >
                            <span className="font-semibold">{String.fromCharCode(65 + idx)}.</span> {option}
                            {isReviewMode && isCorrect && <span className="ml-2 text-green-600 font-bold">✓ Correct</span>}
                            {isReviewMode && isWrong && <span className="ml-2 text-red-600 font-bold">✗ Your Answer</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="mt-auto flex justify-between pt-6 border-t">
                    <Button
                      variant="outline"
                      onClick={() => setCurrentQuestionIndex((prev) => Math.max(0, prev - 1))}
                      disabled={currentQuestionIndex === 0}
                    >
                      Previous
                    </Button>
                    <Button
                      onClick={() => setCurrentQuestionIndex((prev) => Math.min(quiz.questions.length - 1, prev + 1))}
                      disabled={currentQuestionIndex === quiz.questions.length - 1}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Upload & Generate Quiz View */
            <div className="flex-1 flex flex-col p-6">
              <div className="mb-6">
                <h3 className="text-xl font-bold mb-2">Group Quiz</h3>
                <p className="text-sm text-muted-foreground">
                  Upload study materials and generate a quiz for everyone!
                </p>
              </div>

              <div className="space-y-4 mb-6">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold">Uploaded Files ({uploadedFiles.length}/{group.maxParticipants})</h4>
                  <Button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading || uploadedFiles.length >= group.maxParticipants}
                    size="sm"
                  >
                    {isUploading ? (
                      <><Loader2 className="size-4 mr-2 animate-spin" /> Uploading...</>
                    ) : (
                      <><Upload className="size-4 mr-2" /> Upload</>
                    )}
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    accept=".pdf,.txt,.jpg,.jpeg,.png,.mp3,.wav"
                    onChange={handleFileUpload}
                  />
                </div>

                <div className="border rounded-lg p-4 max-h-[200px] overflow-y-auto">
                  {uploadedFiles.length === 0 ? (
                    <p className="text-sm text-gray-500 text-center py-4">
                      No files uploaded yet
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {uploadedFiles.map((file) => (
                        <div key={file.id} className="flex items-center gap-2 text-sm">
                          <FileText className="size-4 text-gray-400" />
                          <span className="flex-1">{file.fileName}</span>
                          <span className="text-xs text-gray-400">
                            {new Date(file.uploadedAt).toLocaleString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-auto">
                <Button
                  onClick={() => setShowQuizSettings(true)}
                  disabled={uploadedFiles.length === 0 || isGeneratingQuiz}
                  className="w-full"
                  size="lg"
                >
                  {isGeneratingQuiz ? (
                    <><Loader2 className="size-5 mr-2 animate-spin" /> Generating...</>
                  ) : (
                    <><BookOpen className="size-5 mr-2" /> Generate Quiz</>
                  )}
                </Button>
              </div>
            </div>
          )}
          </div>
        )}

        {/* Right: Users + chat */}
        <div className="lg:col-span-1 flex flex-col gap-4">
          <Card className="flex-none">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="size-4" />
                  In this room ({presence.length})
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setLeaveDialogOpen(true)}
                  className="gap-1 text-red-600 hover:bg-red-50 hover:text-red-700 h-7 text-xs"
                >
                  <DoorOpen className="size-3" />
                  Leave
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {presence.length === 0 ? (
                  <li className="text-sm text-muted-foreground">No one here yet</li>
                ) : (
                  presence.map((p) => (
                    <li key={p.id} className="text-sm font-medium flex items-center gap-2">
                      <span className="size-2 rounded-full bg-teal-500" />
                      <span>{p.username}</span>
                      {p.medal && (
                        <span className="text-xs" title={`${p.medal} medal`}>
                          {getMedalEmoji(p.medal)}
                        </span>
                      )}
                    </li>
                  ))
                )}
              </ul>
            </CardContent>
          </Card>

          <Card className={`flex-none rounded-2xl ${glassPanelClass}`}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                ⏱️ Personal Study Timer
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="text-center">
                <div className="text-3xl font-bold text-teal-600 font-mono">
                  {Math.floor(timerSeconds / 3600).toString().padStart(2, '0')}:
                  {Math.floor((timerSeconds % 3600) / 60).toString().padStart(2, '0')}:
                  {(timerSeconds % 60).toString().padStart(2, '0')}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {isTimerRunning ? 'Time elapsed' : 'Start timer to track your study'}
                </p>
              </div>
              {isTimerRunning ? (
                <Button onClick={stopRoomTimer} variant="outline" className="w-full" size="sm">
                  ⏹️ Stop Timer
                </Button>
              ) : (
                <Button onClick={startRoomTimer} className="w-full" size="sm">
                  ▶️ Start Timer
                </Button>
              )}
            </CardContent>
          </Card>

          {!isOnlineRoom && (
            <Card className="flex-1 flex flex-col overflow-hidden">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center justify-between">
                  <span>Room chat</span>
                  <span className="text-xs text-muted-foreground">
                    {socketReady ? 'Live' : 'Connecting...'}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="flex-1 min-h-0 flex flex-col gap-3">
                <div
                  ref={chatScrollRef}
                  className="flex-1 min-h-0 overflow-y-auto space-y-2 rounded-2xl border border-gray-200/60 bg-white/70 p-3"
                  onScroll={(event) => {
                    const target = event.currentTarget;
                    const distanceFromBottom =
                      target.scrollHeight - target.scrollTop - target.clientHeight;
                    chatAutoScrollRef.current = distanceFromBottom < 32;
                  }}
                >
                  {chatMessages.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-xs text-gray-400">
                      No messages yet. Say hi!
                    </div>
                  ) : (
                    chatMessages.map((message) => {
                      const isMine = message.senderId === currentUserId;
                      return (
                        <div
                          key={message.id}
                          className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}
                        >
                          <div
                            className={`max-w-[80%] rounded-2xl px-3 py-2 text-xs ${
                              isMine ? 'bg-emerald-500 text-white' : 'bg-gray-100 text-gray-700'
                            } ${message.pending ? 'opacity-70' : ''}`}
                          >
                            {!isMine && (
                              <p className="text-[10px] font-semibold mb-1">{message.senderName}</p>
                            )}
                            <p className="whitespace-pre-wrap">{message.content}</p>
                            <p className="mt-1 text-[10px] opacity-70">
                              {new Date(message.createdAt).toLocaleTimeString('en-US', {
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </p>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    className="flex-1 h-9 rounded-md border border-input bg-transparent px-3 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    placeholder="Type a message..."
                    value={chatInput}
                    onChange={(event) => setChatInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        handleSendMessage();
                      }
                    }}
                  />
                  <Button size="sm" onClick={handleSendMessage} disabled={!chatInput.trim() || !socketReady}>
                    Send
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Quiz Settings Popup */}
      {showQuizSettings && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <Card className={`w-full max-w-md mx-4 rounded-2xl ${glassPanelClass}`}>
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
                  {[20, 25, 30].map((count) => (
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
                  onClick={handleGenerateQuiz}
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
    </div>
  );
}
