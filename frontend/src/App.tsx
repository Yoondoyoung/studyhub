import { useState, useEffect, useRef } from 'react';
import { apiBase } from './utils/api';
import { LoginPage } from './components/LoginPage';
import { RegisterPage, RegisterData } from './components/RegisterPage';
import { DashboardPage } from './components/DashboardPage';
import { StudyGroupsPage } from './components/StudyGroupsPage';
import { SoloStudyPage } from './components/SoloStudyPage';
import { FriendsPage } from './components/FriendsPage';
import { FriendDetailPage } from './components/FriendDetailPage';
import { SettingsPage } from './components/SettingsPage';
import { ProfilePage } from './components/ProfilePage';
import { StudyRoomPage } from './components/StudyRoomPage';
import { MeetingPage } from './components/MeetingPage';
import { Toaster } from './components/ui/sonner';
import { 
  LayoutDashboard, 
  Users, 
  BookOpen, 
  UserCircle, 
  Settings, 
  LogOut,
  GraduationCap,
  MoreVertical,
  Trash2
} from 'lucide-react';
import { toast } from 'sonner';

type Page = 'login' | 'register' | 'dashboard' | 'study-groups' | 'solo-study' | 'friends' | 'settings' | 'profile' | 'friend-detail' | 'room' | 'meeting';

const APP_PAGES: Page[] = ['dashboard', 'study-groups', 'solo-study', 'friends', 'settings'];

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
  username: string;
  email: string;
  category: string;
  profileImageUrl?: string;
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
  const [currentMeetingId, setCurrentMeetingId] = useState<string | null>(null);
  const [inMeeting, setInMeeting] = useState(false);
  const [zoomPopupPos, setZoomPopupPos] = useState({ x: 24, y: 24 });
  const zoomDragRef = useRef({ isDragging: false, startX: 0, startY: 0, startLeft: 0, startTop: 0 });
  const zoomContainerRef = useRef<HTMLDivElement>(null);
  const zoomClientRef = useRef<unknown>(null);
  const zoomMeetingIdRef = useRef<string | null>(null);

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

  const handleMeetingJoined = (client: unknown) => {
    zoomClientRef.current = client;
    zoomMeetingIdRef.current = currentMeetingId;
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

  const ZOOM_POPUP_WIDTH = 360;
  const ZOOM_POPUP_HEIGHT = 280;
  const ZOOM_POPUP_PADDING = 24;

  useEffect(() => {
    if (inMeeting && currentPage !== 'meeting') {
      setZoomPopupPos({
        x: window.innerWidth - ZOOM_POPUP_WIDTH - ZOOM_POPUP_PADDING,
        y: window.innerHeight - ZOOM_POPUP_HEIGHT - ZOOM_POPUP_PADDING,
      });
    }
  }, [inMeeting, currentPage]);

  const onZoomPopupMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    zoomDragRef.current = {
      isDragging: true,
      startX: e.clientX,
      startY: e.clientY,
      startLeft: zoomPopupPos.x,
      startTop: zoomPopupPos.y,
    };
  };

  useEffect(() => {
    if (!inMeeting) return;
    const onMove = (e: MouseEvent) => {
      if (!zoomDragRef.current.isDragging) return;
      const dx = e.clientX - zoomDragRef.current.startX;
      const dy = e.clientY - zoomDragRef.current.startY;
      setZoomPopupPos({
        x: Math.max(0, zoomDragRef.current.startLeft + dx),
        y: Math.max(0, zoomDragRef.current.startTop + dy),
      });
    };
    const onUp = () => { zoomDragRef.current.isDragging = false; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [inMeeting]);

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
      <aside className="fixed left-6 top-6 bottom-6 w-20 bg-white/90 backdrop-blur rounded-[32px] shadow-xl flex flex-col items-center py-8">
        <div className="size-12 rounded-2xl bg-[#e9f6ff] flex items-center justify-center">
          <GraduationCap className="size-6 text-gray-800" />
        </div>

        <nav className="mt-10 flex flex-col items-center gap-5 flex-1">
          <button
            onClick={() => navigateTo('dashboard')}
            className={`size-12 rounded-full flex items-center justify-center transition-colors ${
              currentPage === 'dashboard'
                ? 'bg-black text-white shadow-md'
                : 'bg-white text-gray-600 hover:bg-gray-100'
            }`}
            title="Home"
          >
            <LayoutDashboard className="size-5" />
          </button>

          <button
            onClick={() => navigateTo('study-groups')}
            className={`size-12 rounded-full flex items-center justify-center transition-colors ${
              currentPage === 'study-groups'
                ? 'bg-black text-white shadow-md'
                : 'bg-white text-gray-600 hover:bg-gray-100'
            }`}
            title="Study groups"
          >
            <Users className="size-5" />
          </button>
          
          <div className="relative">
            <button
              onMouseEnter={() => {
                setShowAiStudyDropdown(true);
                loadAiStudySessions();
              }}
              onClick={handleAiStudyClick}
              className={`size-12 rounded-full flex items-center justify-center transition-colors ${
                currentPage === 'solo-study'
                  ? 'bg-black text-white shadow-md'
                  : 'bg-white text-gray-600 hover:bg-gray-100'
              }`}
              title="AI study"
            >
              <BookOpen className="size-5" />
            </button>

            {/* Expanded session list with animation */}
            {showAiStudyDropdown && aiStudySessions.length > 0 && (
              <div 
                className="absolute left-16 top-1/2 -translate-y-1/2 w-44 space-y-0.5 overflow-hidden rounded-xl bg-white shadow-lg p-2"
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
            onClick={() => navigateTo('friends')}
            className={`size-12 rounded-full flex items-center justify-center transition-colors ${
              currentPage === 'friends'
                ? 'bg-black text-white shadow-md'
                : 'bg-white text-gray-600 hover:bg-gray-100'
            }`}
            title="Friends"
          >
            <UserCircle className="size-5" />
          </button>
        </nav>

        <div className="flex flex-col items-center gap-4">
          <button
            onClick={() => setCurrentPage('profile')}
            className="size-12 rounded-full bg-white text-gray-600 hover:bg-gray-100 flex items-center justify-center"
            title="Profile"
          >
            <UserCircle className="size-5" />
          </button>
          <button
            onClick={() => navigateTo('settings')}
            className={`size-10 rounded-full flex items-center justify-center transition-colors ${
              currentPage === 'settings'
                ? 'bg-black text-white'
                : 'bg-white text-gray-500 hover:bg-gray-100'
            }`}
            title="Settings"
          >
            <Settings className="size-4" />
          </button>
          <button
            onClick={handleLogout}
            className="size-10 rounded-full flex items-center justify-center bg-white text-gray-400 hover:bg-gray-100"
            title="Log out"
          >
            <LogOut className="size-4" />
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 pl-32 pr-8 py-8">
        {prototypeMode && (
          <div className="bg-amber-500 text-white py-2 px-6 text-center text-xs font-medium rounded-full mb-4">
            🎨 PROTOTYPE MODE
          </div>
        )}

        <main className="max-w-6xl mx-auto">
          {currentPage === 'dashboard' && (
            <DashboardPage
              accessToken={accessToken}
              userName={user?.username || user?.email}
            />
          )}
          {currentPage === 'study-groups' && (
            <StudyGroupsPage
              accessToken={accessToken}
              userId={user?.id || ''}
              currentUserUsername={user?.username}
              roomUserIsIn={roomUserIsIn}
              onJoinRoom={navigateToRoom}
              onJoinMeeting={navigateToMeeting}
            />
          )}
          {currentPage === 'room' && currentGroupId && (
            <StudyRoomPage
              groupId={currentGroupId}
              accessToken={accessToken}
              onBack={() => navigateTo('study-groups')}
              onLeaveRoom={() => setRoomUserIsIn(null)}
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
          {currentPage === 'friends' && (
            <FriendsPage
              accessToken={accessToken}
              onViewFriend={(friend) => {
                setSelectedFriend(friend);
                setCurrentPage('friend-detail');
              }}
            />
          )}
          {currentPage === 'settings' && (
            <SettingsPage
              accessToken={accessToken}
              onProfileUpdate={(nextProfile) =>
                setUser((prev) => (prev ? { ...prev, ...nextProfile } : prev))
              }
            />
          )}
          {currentPage === 'profile' && user && (
            <ProfilePage accessToken={accessToken} user={user} />
          )}
          {currentPage === 'friend-detail' && selectedFriend && (
            <FriendDetailPage
              accessToken={accessToken}
              friend={selectedFriend}
              onBack={() => setCurrentPage('friends')}
            />
          )}
        </main>

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
          style={inMeeting && currentPage !== 'meeting' ? { left: zoomPopupPos.x, top: zoomPopupPos.y, width: ZOOM_POPUP_WIDTH, height: ZOOM_POPUP_HEIGHT } : undefined}
        >
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