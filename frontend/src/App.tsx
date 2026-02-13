import { useState, useEffect, useRef } from 'react';
import { apiBase } from './utils/api';
import { LoginPage } from './components/LoginPage';
import { RegisterPage, RegisterData } from './components/RegisterPage';
import { DashboardPage } from './components/DashboardPage';
import { StudyGroupsPage } from './components/StudyGroupsPage';
import { SoloStudyPage } from './components/SoloStudyPage';
import { FriendDetailPage } from './components/FriendDetailPage';
import { ProfilePage } from './components/ProfilePage';
import { StudyRoomPage } from './components/StudyRoomPage';
import { MeetingPage } from './components/MeetingPage';
import { CalendarPage } from './components/CalendarPage';
import { Toaster } from './components/ui/sonner';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from './components/ui/avatar';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './components/ui/dialog';
import { 
  LayoutDashboard, 
  BookOpen, 
  UserCircle, 
  LogOut,
  GraduationCap,
  MoreVertical,
  Trash2,
  Calendar,
  ArrowLeft
} from 'lucide-react';

// Custom icon for Study Groups (people with book)
const StudyGroupIcon = ({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
  >
    {/* Three people on top */}
    {/* Left person */}
    <circle cx="5" cy="4" r="1.5" />
    <path d="M3 8c0-1.1.9-2 2-2s2 .9 2 2v1H3V8z" />
    
    {/* Middle person */}
    <circle cx="12" cy="3" r="1.5" />
    <path d="M10 7c0-1.1.9-2 2-2s2 .9 2 2v1h-4V7z" />
    
    {/* Right person */}
    <circle cx="19" cy="4" r="1.5" />
    <path d="M17 8c0-1.1.9-2 2-2s2 .9 2 2v1h-4V8z" />
    
    {/* Open book at bottom */}
    <path d="M4 12h7c.6 0 1 .4 1 1v8c0-.6-.4-1-1-1H4V12z" />
    <path d="M20 12h-7c-.6 0-1 .4-1 1v8c0-.6.4-1 1-1h7V12z" />
    <path d="M12 12v9" strokeWidth="0.5" stroke="currentColor" />
  </svg>
);
import { toast } from 'sonner';

type Page = 'login' | 'register' | 'dashboard' | 'study-groups' | 'solo-study' | 'profile' | 'friend-detail' | 'room' | 'meeting' | 'calendar';

const APP_PAGES: Page[] = ['dashboard', 'study-groups', 'solo-study', 'calendar'];

function getPageFromHash(): Page {
  const hash = window.location.hash.slice(1);
  if (hash.startsWith('room-')) return 'room';
  if (hash.startsWith('meeting-')) return 'meeting';
  if (APP_PAGES.includes(hash as Page)) return hash as Page;
  return 'dashboard';
}

function getGroupIdFromHash(): string | null {
  const hash = window.location.hash.slice(1);
  if (hash.startsWith('room-')) return hash.slice(5);
  return null;
}

function getMeetingIdFromHash(): string | null {
  const hash = window.location.hash.slice(1);
  if (hash.startsWith('meeting-')) return hash.slice(8);
  return null;
}

interface User {
  id: string;
  email: string;
  username: string;
  userId?: string;
  category?: string;
  profileImageUrl?: string;
}

interface Friend {
  id: string;
  username?: string;
  email?: string;
  category?: string;
  profileImageUrl?: string;
  lastActivityAt?: string | null;
}

interface ChatMessage {
  id: string;
  clientId?: string | null;
  senderId: string;
  recipientId: string;
  content: string;
  createdAt: string;
  pending?: boolean;
}

interface StudySession {
  id: string;
  name: string;
  fileCount: number;
  messageCount: number;
  updatedAt: string;
}

export default function App() {
  const [currentPage, setCurrentPage] = useState<Page>('login');
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [prototypeMode, setPrototypeMode] = useState(false);
  const [selectedFriend, setSelectedFriend] = useState<Friend | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [currentGroupId, setCurrentGroupId] = useState<string | null>(null);
  const [aiStudySessions, setAiStudySessions] = useState<StudySession[]>([]);
  const [showAiStudyDropdown, setShowAiStudyDropdown] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);
  const [roomUserIsIn, setRoomUserIsIn] = useState<string | null>(null);
  const [friends, setFriends] = useState<Friend[]>([]);

  const [chatFriend, setChatFriend] = useState<Friend | null>(null);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatMessagesByFriend, setChatMessagesByFriend] = useState<Record<string, ChatMessage[]>>({});
  const [socketReady, setSocketReady] = useState(false);
  const [chatPanelOpen, setChatPanelOpen] = useState(false);
  const [recentChatFriends, setRecentChatFriends] = useState<Friend[]>([]);
  const [chatNotifications, setChatNotifications] = useState<Record<string, boolean>>({});
  const socketRef = useRef<WebSocket | null>(null);
  const friendsRef = useRef<Friend[]>([]);
  const chatFriendRef = useRef<Friend | null>(null);
  const chatPanelOpenRef = useRef(false);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const chatAutoScrollRef = useRef(true);
  const [currentMeetingId, setCurrentMeetingId] = useState<string | null>(null);
  const [inMeeting, setInMeeting] = useState(false);
  const [meetingLauncherOpen, setMeetingLauncherOpen] = useState(false);
  const [meetingLauncherId, setMeetingLauncherId] = useState<string | null>(null);
  const [zoomPopupPos, setZoomPopupPos] = useState({ x: 24, y: 24 });
  const [zoomPopupSize, setZoomPopupSize] = useState({ width: 360, height: 280 });
  const zoomDragRef = useRef({ isDragging: false, startX: 0, startY: 0, startLeft: 0, startTop: 0 });
  const zoomResizeRef = useRef({ isResizing: false, startX: 0, startY: 0, startW: 0, startH: 0 });
  const zoomContainerRef = useRef<HTMLDivElement>(null);
  const zoomClientRef = useRef<unknown>(null);
  const zoomMeetingIdRef = useRef<string | null>(null);
  const [previousGroupsForNotif, setPreviousGroupsForNotif] = useState<any[]>([]);
  const notifiedApplicantsRef = useRef<Set<string>>(new Set()); // Track shown notifications

  useEffect(() => {
    checkSession();
  }, []);

  useEffect(() => {
    if (accessToken && currentPage === 'profile') {
      fetchProfile();
    }
  }, [accessToken, currentPage]);

  useEffect(() => {
    if (!accessToken) return;
    const syncHash = () => {
      const page = getPageFromHash();
      const gid = page === 'room' ? getGroupIdFromHash() : null;
      const mid = page === 'meeting' ? getMeetingIdFromHash() : null;
      setCurrentPage(page);
      setCurrentGroupId(gid);
      setCurrentMeetingId(mid);
      if (page === 'room' && gid) setRoomUserIsIn(gid);
    };
    syncHash();
    window.addEventListener('hashchange', syncHash);
    return () => window.removeEventListener('hashchange', syncHash);
  }, [accessToken]);

  const navigateTo = (page: Page) => {
    if (page === 'room' || page === 'meeting') return;
    if (APP_PAGES.includes(page)) window.location.hash = page;
    setCurrentPage(page);
    setCurrentGroupId(null);
    setCurrentMeetingId(null);
  };

  const navigateToRoom = (groupId: string) => {
    window.location.hash = `room-${groupId}`;
    setCurrentPage('room');
    setCurrentGroupId(groupId);
    setRoomUserIsIn(groupId);
  };

  const navigateToMeeting = (meetingId: string) => {
    window.location.hash = `meeting-${meetingId}`;
    setCurrentPage('meeting');
    setCurrentMeetingId(meetingId);
  };

  const openMeetingLauncher = (meetingId: string) => {
    if (!meetingId) return;
    setMeetingLauncherId(meetingId);
    setMeetingLauncherOpen(true);
  };

  const handleMeetingJoined = (client: unknown, meetingIdOverride?: string | null) => {
    zoomClientRef.current = client;
    zoomMeetingIdRef.current = meetingIdOverride ?? currentMeetingId;
    setInMeeting(true);
    const c = client as { on?: (event: string, cb: (payload: { state?: string }) => void) => void };
    if (typeof c?.on === 'function') {
      c.on('connection-change', (payload) => {
        if (payload?.state === 'Closed') {
          zoomClientRef.current = null;
          zoomMeetingIdRef.current = null;
          setInMeeting(false);
        }
      });
    }
  };

  const handleLeaveFloatingMeeting = async () => {
    try {
      const client = zoomClientRef.current as { leaveMeeting?: (opts?: { confirm?: boolean }) => Promise<unknown> } | null;
      if (client?.leaveMeeting) await client.leaveMeeting({ confirm: false });
      const ZoomMtgEmbedded = (await import('@zoom/meetingsdk/embedded')).default;
      ZoomMtgEmbedded.destroyClient?.();
    } catch {
      // ignore
    } finally {
      zoomClientRef.current = null;
      zoomMeetingIdRef.current = null;
      setInMeeting(false);
      if (currentPage === 'meeting') navigateTo('dashboard');
    }
  };

  const ZOOM_POPUP_PADDING = 24;
  const ZOOM_POPUP_MIN_WIDTH = 280;
  const ZOOM_POPUP_MIN_HEIGHT = 200;
  const ZOOM_POPUP_MAX_WIDTH = 720;
  const ZOOM_POPUP_MAX_HEIGHT = 560;

  useEffect(() => {
    if (inMeeting && currentPage !== 'meeting') {
      setZoomPopupPos({
        x: window.innerWidth - zoomPopupSize.width - ZOOM_POPUP_PADDING,
        y: window.innerHeight - zoomPopupSize.height - ZOOM_POPUP_PADDING,
      });
    }
  }, [inMeeting, currentPage]);

  const onZoomPopupMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button') || (e.target as HTMLElement).closest('[data-resize-handle]')) return;
    zoomDragRef.current = {
      isDragging: true,
      startX: e.clientX,
      startY: e.clientY,
      startLeft: zoomPopupPos.x,
      startTop: zoomPopupPos.y,
    };
  };

  const onZoomPopupResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    zoomResizeRef.current = {
      isResizing: true,
      startX: e.clientX,
      startY: e.clientY,
      startW: zoomPopupSize.width,
      startH: zoomPopupSize.height,
    };
  };

  useEffect(() => {
    if (!inMeeting) return;
    const onMove = (e: MouseEvent) => {
      if (zoomResizeRef.current.isResizing) {
        const dw = e.clientX - zoomResizeRef.current.startX;
        const dh = e.clientY - zoomResizeRef.current.startY;
        setZoomPopupSize({
          width: Math.min(ZOOM_POPUP_MAX_WIDTH, Math.max(ZOOM_POPUP_MIN_WIDTH, zoomResizeRef.current.startW + dw)),
          height: Math.min(ZOOM_POPUP_MAX_HEIGHT, Math.max(ZOOM_POPUP_MIN_HEIGHT, zoomResizeRef.current.startH + dh)),
        });
        return;
      }
      if (!zoomDragRef.current.isDragging) return;
      const dx = e.clientX - zoomDragRef.current.startX;
      const dy = e.clientY - zoomDragRef.current.startY;
      setZoomPopupPos({
        x: Math.max(0, zoomDragRef.current.startLeft + dx),
        y: Math.max(0, zoomDragRef.current.startTop + dy),
      });
    };
    const onUp = () => {
      zoomDragRef.current.isDragging = false;
      zoomResizeRef.current.isResizing = false;
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [inMeeting]);

  const popupW = zoomPopupSize.width;
  const popupH = zoomPopupSize.height;

  const checkSession = async () => {
    const savedToken = localStorage.getItem('accessToken');
    if (savedToken) {
      try {
        const response = await fetch(`${apiBase}/auth/session`, {
          headers: { Authorization: `Bearer ${savedToken}` }
        });
        const data = await response.json();
        
        if (data.user) {
          setAccessToken(savedToken);
          setUser(data.user);
          const page = getPageFromHash();
          setCurrentPage(page);
          setCurrentGroupId(page === 'room' ? getGroupIdFromHash() : null);
        } else {
          localStorage.removeItem('accessToken');
        }
      } catch (error) {
        console.error('Session check failed:', error);
        localStorage.removeItem('accessToken');
      }
    } else {
      setCurrentPage('login');
    }
    setSessionChecked(true);
  };

  const handleLogin = async (email: string, password: string) => {
    try {
      const response = await fetch(`${apiBase}/auth/signin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      const data = await response.json();

      if (data.error) {
        toast.error(data.error);
        return;
      }

      if (data.accessToken && data.user) {
        setAccessToken(data.accessToken);
        setUser(data.user);
        localStorage.setItem('accessToken', data.accessToken);
        navigateTo('dashboard');
        toast.success('Welcome back!');
      }
    } catch (error) {
      console.error('Login error:', error);
      toast.error('Login failed. Please try again.');
    }
  };

  const handleRegister = async (formData: RegisterData) => {
    try {
      const response = await fetch(`${apiBase}/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      const data = await response.json();

      if (data.error) {
        toast.error(data.error);
        return;
      }

      if (data.success) {
        toast.success('Account created! Please log in.');
        setCurrentPage('login');
      }
    } catch (error) {
      console.error('Registration error:', error);
      toast.error('Registration failed. Please try again.');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('accessToken');
    setAccessToken(null);
    setUser(null);
    setCurrentPage('login');
  };

  const fetchProfile = async () => {
    try {
      const response = await fetch(`${apiBase}/settings`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const data = await response.json();
      if (data.settings) {
        setUser((prev) => (prev ? { ...prev, ...data.settings } : prev));
      }
    } catch (error) {
      console.error('Failed to load profile:', error);
    }
  };

  const getInitials = (name?: string, fallback?: string) => {
    const base = (name || fallback || 'U').trim();
    return base
      .split(' ')
      .map((chunk) => chunk[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
  };

  const loadAiStudySessions = async () => {
    try {
      if (!accessToken) return;
      const response = await fetch(`${apiBase}/ai/sessions`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (response.ok) {
        const data = await response.json();
        setAiStudySessions(data.sessions || []);
      }
    } catch (error) {
      console.error('Failed to load AI study sessions:', error);
    }
  };

  const handleAiStudyClick = () => {
    setSelectedSessionId(null); // null means create new session
    navigateTo('solo-study');
  };

  const getActivityStatus = (friend: Friend) => {
    if (!friend.lastActivityAt) {
      return { label: 'Inactive', isOnline: false };
    }
    const last = new Date(friend.lastActivityAt).getTime();
    if (Number.isNaN(last)) {
      return { label: 'Inactive', isOnline: false };
    }
    const diffSeconds = Math.floor((Date.now() - last) / 1000);
    if (diffSeconds < 300) {
      return { label: 'Online', isOnline: true };
    }
    return { label: 'Offline', isOnline: false };
  };

  const getChatMessages = (friendId: string) => chatMessagesByFriend[friendId] || [];

  const upsertChatMessage = (friendId: string, message: ChatMessage) => {
    setChatMessagesByFriend((prev) => {
      const existing = prev[friendId] || [];
      if (message.clientId) {
        const index = existing.findIndex((item) => item.clientId === message.clientId);
        if (index !== -1) {
          const next = [...existing];
          next[index] = { ...message, pending: false };
          return { ...prev, [friendId]: next };
        }
      }
      return { ...prev, [friendId]: [...existing, message] };
    });
  };

  const loadChatHistory = async (friend: Friend) => {
    setChatLoading(true);
    try {
      const response = await fetch(`${apiBase}/dm/${friend.id}`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const data = await response.json();
      setChatMessagesByFriend((prev) => ({
        ...prev,
        [friend.id]: Array.isArray(data.messages) ? data.messages : []
      }));
    } catch (error) {
      console.error('Failed to fetch chat history:', error);
    } finally {
      setChatLoading(false);
    }
  };

  const handleOpenChat = (friend: Friend) => {
    setChatFriend(friend);
    setChatPanelOpen(true);
    setRecentChatFriends((prev) => {
      const next = [friend, ...prev.filter((item) => item.id !== friend.id)];
      return next.slice(0, 3);
    });
    setChatNotifications((prev) => ({ ...prev, [friend.id]: false }));
    loadChatHistory(friend);
  };

  const handleEndChat = () => {
    if (chatFriend) {
      setRecentChatFriends((prev) => prev.filter((item) => item.id !== chatFriend.id));
      setChatNotifications((prev) => ({ ...prev, [chatFriend.id]: false }));
    }
    setChatPanelOpen(false);
    setChatFriend(null);
    setChatInput('');
  };

  const handleSendChat = () => {
    if (!chatFriend || !chatInput.trim() || !socketRef.current || !socketReady || !user?.id) return;
    const clientId = crypto.randomUUID();
    const content = chatInput.trim();
    const tempMessage: ChatMessage = {
      id: clientId,
      clientId,
      senderId: user.id,
      recipientId: chatFriend.id,
      content,
      createdAt: new Date().toISOString(),
      pending: true
    };
    upsertChatMessage(chatFriend.id, tempMessage);
    socketRef.current.send(
      JSON.stringify({
        type: 'chat:send',
        recipientId: chatFriend.id,
        content,
        clientId
      })
    );
    setChatInput('');
  };

  const handleSessionSelect = (sessionId: string) => {
    setSelectedSessionId(sessionId);
    setShowAiStudyDropdown(false);
    navigateTo('solo-study');
  };

  const handleDeleteSession = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (!confirm('Are you sure you want to delete this study session?')) {
      return;
    }

    setDeletingSessionId(sessionId);

    try {
      const response = await fetch(`${apiBase}/ai/sessions/${sessionId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      if (response.ok) {
        toast.success('Session deleted successfully');
        await loadAiStudySessions();
        
        // If we're currently viewing the deleted session, go back to new session
        if (selectedSessionId === sessionId) {
          setSelectedSessionId(null);
          if (currentPage === 'solo-study') {
            // Trigger reload by navigating away and back
            setCurrentPage('dashboard');
            setTimeout(() => navigateTo('solo-study'), 50);
          }
        }
      } else {
        const data = await response.json();
        toast.error(data.error || 'Failed to delete session');
      }
    } catch (error) {
      console.error('Failed to delete session:', error);
      toast.error('Failed to delete session');
    } finally {
      setDeletingSessionId(null);
    }
  };

  // Load AI study sessions when user is logged in
  useEffect(() => {
    if (accessToken) {
      loadAiStudySessions();
    }
  }, [accessToken]);

  // Handle applicant actions
  const handleApplicantAction = async (groupId: string, applicantId: string, action: 'accept' | 'reject', toastId: string | number) => {
    try {
      const response = await fetch(`${apiBase}/study-groups/${groupId}/manage`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({ applicantId, action })
      });
      const data = await response.json();
      
      if (data.success) {
        // Update the same toast with success message, remove buttons, auto-dismiss after 3 seconds
        toast.success(action === 'accept' ? '✅ Applicant accepted' : '❌ Applicant rejected', { 
          id: toastId,
          duration: 3000,
          action: undefined,
          cancel: undefined
        });
        // Keep in notifiedApplicantsRef to prevent re-notification
      } else {
        toast.error(data.error || 'Action failed', { 
          id: toastId,
          duration: 3000,
          action: undefined,
          cancel: undefined
        });
      }
    } catch (error) {
      console.error('Failed to manage applicant:', error);
      toast.error('Action failed', { 
        id: toastId,
        duration: 3000,
        action: undefined,
        cancel: undefined
      });
    }
  };

  // Global polling for applicant notifications
  useEffect(() => {
    if (!accessToken || !user?.id) return;

    const checkForNewApplicants = async () => {
      try {
        const response = await fetch(`${apiBase}/study-groups`);
        const data = await response.json();
        const groups = data.groups || [];

        // Check for new applicants and application results
        if (previousGroupsForNotif.length > 0) {
          groups.forEach((newGroup: any) => {
            // 1. Check for new applicants (for hosts)
            if (newGroup.hostId === user.id) {
              const oldGroup = previousGroupsForNotif.find((g: any) => g.id === newGroup.id);
              if (oldGroup) {
                const oldApplicants = oldGroup.applicants || [];
                const newApplicants = newGroup.applicants || [];
                
                // Find newly added applicants
                const addedApplicants = newApplicants.filter(
                  (applicantId: string) => !oldApplicants.includes(applicantId)
                );
                
                // Show toast for each new applicant (only once)
                addedApplicants.forEach((applicantId: string) => {
                  const notifKey = `${newGroup.id}-${applicantId}`;
                  if (!notifiedApplicantsRef.current.has(notifKey)) {
                    notifiedApplicantsRef.current.add(notifKey);
                    
                    const applicantInfo = newGroup.applicantsWithNames?.find(
                      (item: { id: string; username: string }) => item.id === applicantId
                    );
                    const applicantName = applicantInfo?.username || `User ${applicantId.slice(0, 8)}`;
                    
                    const toastId = toast.info(
                      `📬 ${applicantName} wants to join "${newGroup.topic}"`,
                      {
                        duration: Infinity,
                        action: {
                          label: 'Accept',
                          onClick: () => handleApplicantAction(newGroup.id, applicantId, 'accept', toastId)
                        },
                        cancel: {
                          label: 'Reject',
                          onClick: () => handleApplicantAction(newGroup.id, applicantId, 'reject', toastId)
                        }
                      }
                    );
                  }
                });
              }
            }
            
            // 2. Check if I was accepted/rejected (for applicants)
            const oldGroup = previousGroupsForNotif.find((g: any) => g.id === newGroup.id);
            if (oldGroup) {
              const wasApplicant = oldGroup.applicants?.includes(user.id);
              const isStillApplicant = newGroup.applicants?.includes(user.id);
              const isNowParticipant = newGroup.participants?.includes(user.id);
              
              if (wasApplicant && !isStillApplicant) {
                // I was an applicant but not anymore - check result
                const notifKey = `applicant-result-${newGroup.id}`;
                if (!notifiedApplicantsRef.current.has(notifKey)) {
                  notifiedApplicantsRef.current.add(notifKey);
                  
                  if (isNowParticipant) {
                    toast.success(`✅ You've been accepted to "${newGroup.topic}"!`, { duration: 5000 });
                  } else {
                    toast.error(`❌ Your application to "${newGroup.topic}" was rejected`, { duration: 5000 });
                  }
                }
              }
            }
          });
        }
        
        setPreviousGroupsForNotif(groups);
      } catch (error) {
        console.error('Failed to check for new applicants:', error);
      }
    };

    // Initial check
    checkForNewApplicants();

    // Poll every 5 seconds
    const interval = setInterval(checkForNewApplicants, 5000);

    return () => clearInterval(interval);
  }, [accessToken, user?.id, previousGroupsForNotif]);

  useEffect(() => {
    if (!accessToken) return;
    const fetchFriends = async () => {
      try {
        const response = await fetch(`${apiBase}/friends`, {
          headers: { Authorization: `Bearer ${accessToken}` }
        });
        const data = await response.json();
        setFriends(data.friends || []);
      } catch (error) {
        console.error('Failed to fetch friends:', error);
      }
    };
    fetchFriends();
  }, [accessToken]);

  useEffect(() => {
    friendsRef.current = friends;
  }, [friends]);

  useEffect(() => {
    chatFriendRef.current = chatFriend;
  }, [chatFriend]);

  useEffect(() => {
    chatPanelOpenRef.current = chatPanelOpen;
  }, [chatPanelOpen]);

  useEffect(() => {
    if (!accessToken || !user?.id) return;
    const socket = new WebSocket(`${apiBase.replace(/^http/, 'ws')}/ws?token=${encodeURIComponent(accessToken)}`);
    socketRef.current = socket;
    setSocketReady(false);

    socket.onopen = () => {
      setSocketReady(true);
    };

    socket.onclose = () => {
      setSocketReady(false);
    };

    socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload?.type === 'chat:message' && payload?.message) {
          const message = payload.message as ChatMessage;
          const friendId =
            message.senderId === user.id ? message.recipientId : message.senderId;
          upsertChatMessage(friendId, message);
          if (message.senderId !== user.id) {
            const activeFriendId = chatFriendRef.current?.id;
            const isChatOpen = chatPanelOpenRef.current;
            if (!isChatOpen || activeFriendId !== friendId) {
              const friendInfo =
                friendsRef.current.find((friend) => friend.id === friendId) ||
                chatFriendRef.current ||
                {
                  id: friendId,
                  username: 'Friend',
                  email: '',
                  category: '',
                  lastActivityAt: null,
                  profileImageUrl: ''
                };
              setRecentChatFriends((prev) => {
                const next = [friendInfo as Friend, ...prev.filter((item) => item.id !== friendId)];
                return next.slice(0, 3);
              });
              setChatNotifications((prev) => ({ ...prev, [friendId]: true }));
            }
          }
          return;
        }

        if (payload?.type === 'friend:request') {
          const senderName = payload?.request?.requester?.username || 'Someone';
          toast.info(`${senderName} sent you a friend request.`);
          return;
        }

        if (payload?.type === 'friend:request:accepted') {
          const friendName = payload?.friend?.username || 'Your friend';
          toast.success(`${friendName} accepted your request.`);
          // Refresh friend list so chat targets are up-to-date.
          fetch(`${apiBase}/friends`, {
            headers: { Authorization: `Bearer ${accessToken}` }
          })
            .then((response) => response.json())
            .then((data) => setFriends(data.friends || []))
            .catch(() => {});
          return;
        }

        if (payload?.type === 'friend:request:rejected') {
          toast.error('Your friend request was rejected.');
          return;
        }

        if (payload?.type === 'chat:error') {
          const recipientId = String(payload?.recipientId || '');
          const failedClientId = payload?.clientId ? String(payload.clientId) : '';
          if (recipientId && failedClientId) {
            setChatMessagesByFriend((prev) => {
              const existing = prev[recipientId] || [];
              const next = existing.filter((item) => item.clientId !== failedClientId);
              return { ...prev, [recipientId]: next };
            });
          }
          toast.error(payload?.message || 'Unable to send message.');
          return;
        }
      } catch (error) {
        console.error('Failed to parse chat message:', error);
      }
    };

    return () => {
      socket.close();
      socketRef.current = null;
    };
  }, [accessToken, user?.id]);

  useEffect(() => {
    if (!chatFriend || !chatPanelOpen) return;
    const container = chatScrollRef.current;
    if (!container) return;
    if (chatAutoScrollRef.current) {
      container.scrollTop = container.scrollHeight;
    }
  }, [chatMessagesByFriend, chatFriend, chatPanelOpen]);

  if (!sessionChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f5f5f7]">
        <div className="flex flex-col items-center gap-3">
          <GraduationCap className="size-10 text-teal-600 animate-pulse" />
          <p className="text-sm text-gray-500">Loading...</p>
        </div>
      </div>
    );
  }

  if (!accessToken) {
    return (
      <>
        {currentPage === 'login' ? (
          <LoginPage
            onLogin={handleLogin}
            onNavigateToRegister={() => setCurrentPage('register')}
          />
        ) : (
          <RegisterPage
            onRegister={handleRegister}
            onNavigateToLogin={() => setCurrentPage('login')}
          />
        )}
        <Toaster />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#eaf5ff] via-[#f7f9ff] to-[#fde9f1] flex">
      {/* Sidebar */}
      <aside className="group/sidebar fixed left-6 top-6 bottom-6 w-20 hover:w-64 bg-white/90 backdrop-blur rounded-[32px] shadow-xl flex flex-col py-8 px-3 transition-all duration-300 overflow-visible">
        <div className="h-12 flex items-center justify-center group-hover/sidebar:justify-start transition-all">
          <div className="size-12 rounded-2xl bg-[#e9f6ff] flex items-center justify-center shrink-0">
            <GraduationCap className="size-6 text-gray-800" />
          </div>
        </div>

        <nav className="mt-10 flex flex-col gap-3 flex-1">
          <button
            onClick={() => navigateTo('dashboard')}
            className="w-full rounded-xl px-1.5 py-1 flex items-center gap-3 hover:bg-gray-50 transition-colors"
            title="Dashboard"
          >
            <span className={`size-10 rounded-full flex items-center justify-center shrink-0 transition-colors ${
              currentPage === 'dashboard'
                ? 'bg-black text-white shadow-md'
                : 'bg-white text-gray-600'
            }`}>
              <LayoutDashboard className="size-5" />
            </span>
            <span className="text-sm font-medium text-gray-700 whitespace-nowrap overflow-hidden max-w-0 opacity-0 translate-x-1 group-hover/sidebar:max-w-[140px] group-hover/sidebar:opacity-100 group-hover/sidebar:translate-x-0 transition-all duration-200">
              Dashboard
            </span>
          </button>

          <button
            onClick={() => navigateTo('study-groups')}
            className="w-full rounded-xl px-1.5 py-1 flex items-center gap-3 hover:bg-gray-50 transition-colors"
            title="Group Study"
          >
            <span className={`size-10 rounded-full flex items-center justify-center shrink-0 transition-colors ${
              currentPage === 'study-groups'
                ? 'bg-black text-white shadow-md'
                : 'bg-white text-gray-600'
            }`}>
              <StudyGroupIcon className="size-5" />
            </span>
            <span className="text-sm font-medium text-gray-700 whitespace-nowrap overflow-hidden max-w-0 opacity-0 translate-x-1 group-hover/sidebar:max-w-[140px] group-hover/sidebar:opacity-100 group-hover/sidebar:translate-x-0 transition-all duration-200">
              Group Study
            </span>
          </button>
          
          <div className="relative">
            <button
              onMouseEnter={() => {
                setShowAiStudyDropdown(true);
                loadAiStudySessions();
              }}
              onClick={handleAiStudyClick}
              className="w-full rounded-xl px-1.5 py-1 flex items-center gap-3 hover:bg-gray-50 transition-colors"
              title="AI Study"
            >
              <span className={`size-10 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                currentPage === 'solo-study'
                  ? 'bg-black text-white shadow-md'
                  : 'bg-white text-gray-600'
              }`}>
                <BookOpen className="size-5" />
              </span>
              <span className="text-sm font-medium text-gray-700 whitespace-nowrap overflow-hidden max-w-0 opacity-0 translate-x-1 group-hover/sidebar:max-w-[140px] group-hover/sidebar:opacity-100 group-hover/sidebar:translate-x-0 transition-all duration-200">
                AI Study
              </span>
            </button>

            {/* Expanded session list with animation */}
            {showAiStudyDropdown && aiStudySessions.length > 0 && (
              <div 
                className="absolute left-full ml-2 top-1/2 -translate-y-1/2 w-44 space-y-0.5 overflow-hidden rounded-xl bg-white shadow-lg p-2"
                onMouseLeave={() => setShowAiStudyDropdown(false)}
                style={{
                  animation: 'slideDown 0.2s ease-out'
                }}
              >
                {aiStudySessions.map((session, index) => (
                  <div
                    key={session.id}
                    className="relative group"
                    style={{ 
                      animation: `fadeInSlide 0.3s ease-out ${index * 0.05}s forwards`,
                      opacity: 0
                    }}
                  >
                    <button
                      onClick={() => handleSessionSelect(session.id)}
                      className="w-full text-left px-3 py-2 pr-8 rounded-md hover:bg-gray-50 transition-all duration-150 text-xs"
                    >
                      <p className="font-medium text-gray-700 truncate">
                        {session.name.replace('Study Session - ', '')}
                      </p>
                      <p className="text-gray-500 mt-0.5">
                        {session.fileCount}f • {session.messageCount}m
                      </p>
                    </button>
                    <button
                      onClick={(e) => handleDeleteSession(session.id, e)}
                      disabled={deletingSessionId === session.id}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-red-100 opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Delete session"
                    >
                      {deletingSessionId === session.id ? (
                        <div className="size-3.5 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Trash2 className="size-3.5 text-red-600" />
                      )}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          
          <button
            onClick={() => navigateTo('calendar')}
            className="w-full rounded-xl px-1.5 py-1 flex items-center gap-3 hover:bg-gray-50 transition-colors"
            title="Calendar"
          >
            <span className={`size-10 rounded-full flex items-center justify-center shrink-0 transition-colors ${
              currentPage === 'calendar'
                ? 'bg-black text-white shadow-md'
                : 'bg-white text-gray-600'
            }`}>
              <Calendar className="size-5" />
            </span>
            <span className="text-sm font-medium text-gray-700 whitespace-nowrap overflow-hidden max-w-0 opacity-0 translate-x-1 group-hover/sidebar:max-w-[140px] group-hover/sidebar:opacity-100 group-hover/sidebar:translate-x-0 transition-all duration-200">
              Calendar
            </span>
          </button>

          <button
            onClick={() => setCurrentPage('profile')}
            className="w-full rounded-xl px-1.5 py-1 flex items-center gap-3 hover:bg-gray-50 transition-colors"
            title="Profile"
          >
            <span className={`size-10 rounded-full flex items-center justify-center shrink-0 transition-colors ${
              currentPage === 'profile'
                ? 'bg-black text-white shadow-md'
                : 'bg-white text-gray-600'
            }`}>
              <UserCircle className="size-5" />
            </span>
            <span className="text-sm font-medium text-gray-700 whitespace-nowrap overflow-hidden max-w-0 opacity-0 translate-x-1 group-hover/sidebar:max-w-[140px] group-hover/sidebar:opacity-100 group-hover/sidebar:translate-x-0 transition-all duration-200">
              Profile
            </span>
          </button>

          <button
            onClick={handleLogout}
            className="w-full rounded-xl px-1.5 py-1 flex items-center gap-3 hover:bg-gray-50 transition-colors"
            title="Logout"
          >
            <span className="size-10 rounded-full flex items-center justify-center shrink-0 transition-colors bg-white text-gray-400">
              <LogOut className="size-4" />
            </span>
            <span className="text-sm font-medium text-gray-500 whitespace-nowrap overflow-hidden max-w-0 opacity-0 translate-x-1 group-hover/sidebar:max-w-[140px] group-hover/sidebar:opacity-100 group-hover/sidebar:translate-x-0 transition-all duration-200">
              Logout
            </span>
          </button>
        </nav>
      </aside>

      {/* Main Content */}
      <div className="flex-1 pl-32 pr-8 py-8">
        {prototypeMode && (
          <div className="bg-amber-500 text-white py-2 px-6 text-center text-xs font-medium rounded-full mb-4">
            🎨 PROTOTYPE MODE
          </div>
        )}

        <main className="max-w-6xl mx-auto">
          <div className="mb-6 flex items-center justify-between">
            <h1 className="text-3xl font-semibold text-gray-900">
              Hi {user?.username || user?.email || 'there'},
            </h1>
            {currentPage === 'friend-detail' && selectedFriend ? (
              <Button
                variant="ghost"
                onClick={() => navigateTo('dashboard')}
                className="rounded-xl text-gray-600 hover:text-gray-900"
              >
                <ArrowLeft className="size-4 mr-2" />
                Back to dashboard
              </Button>
            ) : null}
          </div>
          {currentPage === 'dashboard' && (
            <DashboardPage
              accessToken={accessToken}
              onOpenChat={handleOpenChat}
              onViewFriend={(friend) => {
                setSelectedFriend(friend);
                setCurrentPage('friend-detail');
              }}
            />
          )}
          {currentPage === 'study-groups' && (
            <StudyGroupsPage
              accessToken={accessToken}
              userId={user?.id || ''}
              currentUserUsername={user?.username}
              roomUserIsIn={roomUserIsIn}
              onJoinRoom={navigateToRoom}
              onJoinMeeting={openMeetingLauncher}
            />
          )}
          {currentPage === 'room' && currentGroupId && (
            <StudyRoomPage
              groupId={currentGroupId}
              accessToken={accessToken}
              currentUserId={user?.id || ''}
              onBack={() => navigateTo('study-groups')}
              onLeaveRoom={() => setRoomUserIsIn(null)}
              onJoinMeeting={openMeetingLauncher}
            />
          )}
          {currentPage === 'meeting' && currentMeetingId && (
            <MeetingPage
              meetingId={currentMeetingId}
              accessToken={accessToken}
              userName={user?.username || user?.email || 'Guest'}
              onBack={() => navigateTo('dashboard')}
              zoomContainerRef={zoomContainerRef}
              onMeetingJoined={handleMeetingJoined}
            />
          )}
          {currentPage === 'solo-study' && (
            <SoloStudyPage 
              initialSessionId={selectedSessionId}
              onSessionsChange={loadAiStudySessions}
            />
          )}
          {currentPage === 'calendar' && (
            <CalendarPage accessToken={accessToken} />
          )}
          {currentPage === 'profile' && user && (
            <ProfilePage 
              accessToken={accessToken} 
              user={user}
              onProfileUpdate={(nextProfile) =>
                setUser((prev) => (prev ? { ...prev, ...nextProfile } : prev))
              }
            />
          )}
          {currentPage === 'friend-detail' && selectedFriend && (
            <FriendDetailPage
              accessToken={accessToken}
              friend={selectedFriend}
            />
          )}
        </main>

        {!chatPanelOpen && recentChatFriends.length > 0 && (
          <div className="fixed bottom-6 right-6 z-40 flex items-center gap-2">
            {recentChatFriends.map((friend) => {
              const latest =
                friends.find((item) => item.id === friend.id) || friend;
              const isOnline = getActivityStatus(latest).isOnline;
              const isNotified = Boolean(chatNotifications[friend.id]);
              const ringClass = isNotified
                ? 'ring-2 ring-emerald-400 animate-pulse'
                : isOnline
                ? 'ring-2 ring-emerald-200'
                : '';
              return (
                <button
                  key={friend.id}
                  className={`size-12 rounded-full bg-white shadow-[0_20px_40px_rgba(15,23,42,0.18)] flex items-center justify-center hover:scale-[1.02] transition ${ringClass}`}
                  onClick={() => handleOpenChat(latest)}
                  title={latest.username || latest.email || 'Chat'}
                >
                  <Avatar className="size-10">
                    {latest.profileImageUrl ? (
                      <AvatarImage src={latest.profileImageUrl} alt={latest.username || 'Friend'} />
                    ) : null}
                    <AvatarFallback className="bg-gray-100 text-gray-600 text-xs font-semibold">
                      {getInitials(latest.username || latest.email || 'F')}
                    </AvatarFallback>
                  </Avatar>
                </button>
              );
            })}
          </div>
        )}

        {/* Meeting launcher: open Zoom join UI without leaving current page */}
        <Dialog
          open={meetingLauncherOpen}
          onOpenChange={(open) => {
            setMeetingLauncherOpen(open);
            if (!open) setMeetingLauncherId(null);
          }}
        >
          <DialogContent className="sm:max-w-5xl max-w-[calc(100%-2rem)] p-0 max-h-[90vh] overflow-auto">
            <DialogHeader className="px-6 pt-6">
              <DialogTitle>Join Zoom meeting</DialogTitle>
            </DialogHeader>
            <div className="px-6 pb-6">
              {meetingLauncherId ? (
                <MeetingPage
                  meetingId={meetingLauncherId}
                  accessToken={accessToken}
                  userName={user?.username || user?.email || 'Guest'}
                  onBack={() => setMeetingLauncherOpen(false)}
                  zoomContainerRef={zoomContainerRef}
                  onMeetingJoined={(client) => {
                    // Track meeting id for the floating "Return to meeting" button
                    setCurrentMeetingId(meetingLauncherId);
                    handleMeetingJoined(client, meetingLauncherId);
                    setMeetingLauncherOpen(false);
                  }}
                />
              ) : (
                <div className="py-10 text-center text-sm text-gray-500">Missing meeting id.</div>
              )}
            </div>
          </DialogContent>
        </Dialog>

        {chatFriend && chatPanelOpen && (
          <div className="fixed bottom-6 right-6 z-40 w-[360px] h-[480px] rounded-3xl shadow-[0_20px_60px_rgba(15,23,42,0.18)] bg-white/95 border border-white/70 backdrop-blur">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-900">
                  {chatFriend ? chatFriend.username || chatFriend.email || 'Friend' : 'Chat'}
                </p>
                <p className="text-[10px] text-gray-400">
                  {socketReady ? 'Connected' : 'Connecting...'}
                  {chatLoading ? ' • Loading history...' : ''}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="text-[10px] text-gray-400 hover:text-gray-600"
                  onClick={() => setChatPanelOpen(false)}
                >
                  Close
                </button>
                <button
                  className="text-[10px] text-gray-400 hover:text-gray-600"
                  onClick={handleEndChat}
                >
                  End
                </button>
              </div>
            </div>
            <div
              ref={chatScrollRef}
              className="h-[320px] overflow-y-auto px-4 py-3 space-y-3"
              onScroll={(event) => {
                const target = event.currentTarget;
                const distanceFromBottom =
                  target.scrollHeight - target.scrollTop - target.clientHeight;
                chatAutoScrollRef.current = distanceFromBottom < 32;
              }}
            >
              {!chatFriend ? null : (getChatMessages(chatFriend.id).length ? (
                getChatMessages(chatFriend.id).map((message) => {
                  const isMine = message.senderId === user?.id;
                  return (
                    <div
                      key={message.id}
                      className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[75%] rounded-2xl px-3 py-2 text-xs ${
                          isMine ? 'bg-emerald-500 text-white' : 'bg-gray-100 text-gray-700'
                        } ${message.pending ? 'opacity-70' : ''}`}
                      >
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
              ) : (
                <div className="h-full flex items-center justify-center text-xs text-gray-400">
                  No messages yet. Say hi!
                </div>
              ))}
            </div>
            <div className="p-3 border-t border-gray-100 flex items-center gap-2">
              <Input
                placeholder="Type a message..."
                value={chatInput}
                onChange={(event) => setChatInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    handleSendChat();
                  }
                }}
              />
              <Button onClick={handleSendChat} disabled={!chatInput.trim() || !socketReady}>
                Send
              </Button>
            </div>
          </div>
        )}

        {/* Zoom meeting: full size on meeting page, small popup when on other pages */}
        <div
          ref={zoomContainerRef}
          className={`bg-[#1a1a1a] rounded-xl overflow-hidden border border-gray-200 z-50 ${
            inMeeting
              ? currentPage === 'meeting'
                ? 'fixed left-32 right-8 top-6 bottom-6 shadow-xl'
                : 'fixed shadow-2xl'
              : currentPage === 'meeting'
                ? 'fixed left-32 right-8 top-6 bottom-6 opacity-0 pointer-events-none'
                : 'fixed right-6 bottom-6 w-0 h-0 overflow-hidden opacity-0 pointer-events-none'
          }`}
          style={inMeeting && currentPage !== 'meeting' ? { left: zoomPopupPos.x, top: zoomPopupPos.y, width: popupW, height: popupH } : undefined}
        >
          {inMeeting && currentPage !== 'meeting' && (
            <div
              data-resize-handle
              className="absolute right-0 bottom-0 w-4 h-4 cursor-nwse-resize resize-handle z-20"
              onMouseDown={onZoomPopupResizeMouseDown}
              role="presentation"
              aria-label="Resize"
            >
              <svg className="absolute right-1 bottom-1 w-3 h-3 text-white/50" viewBox="0 0 16 16" fill="currentColor">
                <path d="M15 15H9v-2h4V9h2v6zM7 15H1V9h2v4h4v2zM15 7V1H9v2h4v4h2zM7 1v2H3v4H1V1h6z" />
              </svg>
            </div>
          )}
          {inMeeting && currentPage === 'meeting' && (
            <div className="absolute top-0 left-0 right-0 h-10 bg-black/60 flex items-center justify-end px-3 z-10">
              <button
                type="button"
                onClick={handleLeaveFloatingMeeting}
                className="text-red-400 hover:text-red-300 text-sm font-medium px-3 py-1.5 rounded bg-red-500/20 hover:bg-red-500/30"
              >
                Leave
              </button>
            </div>
          )}
          {inMeeting && currentPage !== 'meeting' && (
            <div
              className="absolute top-0 left-0 right-0 h-10 bg-black/60 flex items-center justify-between gap-2 px-3 z-10 cursor-grab active:cursor-grabbing select-none"
              onMouseDown={onZoomPopupMouseDown}
              role="presentation"
            >
              <span className="text-white text-sm font-medium truncate">Meeting in progress</span>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => zoomMeetingIdRef.current && navigateToMeeting(zoomMeetingIdRef.current)}
                  className="text-white/90 hover:text-white text-xs font-medium px-2 py-1 rounded bg-white/10 hover:bg-white/20"
                >
                  Return to meeting
                </button>
                <button
                  type="button"
                  onClick={handleLeaveFloatingMeeting}
                  className="text-red-400 hover:text-red-300 text-sm font-medium"
                >
                  Leave
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <Toaster />
    </div>
  );
}