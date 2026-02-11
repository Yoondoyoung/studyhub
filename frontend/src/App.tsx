import { useState, useEffect } from 'react';
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
import { Toaster } from './components/ui/sonner';
import { Avatar, AvatarFallback, AvatarImage } from './components/ui/avatar';
import { 
  LayoutDashboard, 
  Users, 
  BookOpen, 
  UserCircle, 
  Settings, 
  LogOut,
  GraduationCap 
} from 'lucide-react';
import { toast } from 'sonner';

type Page = 'login' | 'register' | 'dashboard' | 'study-groups' | 'solo-study' | 'friends' | 'settings' | 'profile' | 'friend-detail' | 'room';

const APP_PAGES: Page[] = ['dashboard', 'study-groups', 'solo-study', 'friends', 'settings'];

function getPageFromHash(): Page {
  const hash = window.location.hash.slice(1);
  if (hash.startsWith('room-')) return 'room';
  if (APP_PAGES.includes(hash as Page)) return hash as Page;
  return 'dashboard';
}

function getGroupIdFromHash(): string | null {
  const hash = window.location.hash.slice(1);
  if (hash.startsWith('room-')) return hash.slice(5);
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
      setCurrentPage(page);
      setCurrentGroupId(page === 'room' ? getGroupIdFromHash() : null);
    };
    syncHash();
    window.addEventListener('hashchange', syncHash);
    return () => window.removeEventListener('hashchange', syncHash);
  }, [accessToken]);

  const navigateTo = (page: Page) => {
    if (page === 'room') return;
    if (APP_PAGES.includes(page)) window.location.hash = page;
    setCurrentPage(page);
    setCurrentGroupId(null);
  };

  const navigateToRoom = (groupId: string) => {
    window.location.hash = `room-${groupId}`;
    setCurrentPage('room');
    setCurrentGroupId(groupId);
  };

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
    <div className="min-h-screen bg-[#f5f5f7] flex">
      {/* Sidebar */}
      <aside className="w-56 bg-white flex flex-col fixed h-full shadow-sm">
        {/* Logo */}
        <div className="p-6">
          <div className="flex items-center gap-2">
            <GraduationCap className="size-6 text-teal-600" />
            <span className="text-lg font-bold tracking-tight text-gray-900">STUDYHUB</span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-4 space-y-1">
          <button
            onClick={() => navigateTo('dashboard')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm ${
              currentPage === 'dashboard'
                ? 'bg-gray-100 text-gray-900'
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            }`}
          >
            <LayoutDashboard className="size-4" />
            <span className="font-medium">Overview</span>
          </button>
          
          <button
            onClick={() => navigateTo('study-groups')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm ${
              currentPage === 'study-groups'
                ? 'bg-gray-100 text-gray-900'
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            }`}
          >
            <Users className="size-4" />
            <span className="font-medium">Study Groups</span>
          </button>
          
          <div>
            <button
              onMouseEnter={() => {
                setShowAiStudyDropdown(true);
                loadAiStudySessions();
              }}
              onClick={handleAiStudyClick}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm ${
                currentPage === 'solo-study'
                  ? 'bg-gray-100 text-gray-900'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              <BookOpen className="size-4" />
              <span className="font-medium">AI Study</span>
            </button>

            {/* Expanded session list with animation */}
            {showAiStudyDropdown && aiStudySessions.length > 0 && (
              <div 
                className="pl-6 space-y-0.5 mt-1 overflow-hidden"
                onMouseLeave={() => setShowAiStudyDropdown(false)}
                style={{
                  animation: 'slideDown 0.2s ease-out'
                }}
              >
                {aiStudySessions.map((session, index) => (
                  <button
                    key={session.id}
                    onClick={() => handleSessionSelect(session.id)}
                    className="w-full text-left px-3 py-2 rounded-md hover:bg-gray-50 transition-all duration-150 text-xs"
                    style={{ 
                      animation: `fadeInSlide 0.3s ease-out ${index * 0.05}s forwards`,
                      opacity: 0
                    }}
                  >
                    <p className="font-medium text-gray-700 truncate">
                      {session.name.replace('Study Session - ', '')}
                    </p>
                    <p className="text-gray-500 mt-0.5">
                      {session.fileCount}f • {session.messageCount}m
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>
          
          <button
            onClick={() => navigateTo('friends')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm ${
              currentPage === 'friends'
                ? 'bg-gray-100 text-gray-900'
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            }`}
          >
            <UserCircle className="size-4" />
            <span className="font-medium">Friends</span>
          </button>
        </nav>

        {/* Bottom Section */}
        <div className="px-4 pb-4 space-y-1">
          <button
            onClick={() => navigateTo('settings')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm ${
              currentPage === 'settings'
                ? 'bg-gray-100 text-gray-900'
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            }`}
          >
            <Settings className="size-4" />
            <span className="font-medium">Settings</span>
          </button>
          <button onClick={handleLogout} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-500 hover:bg-gray-50">
            <LogOut className="size-4" />
            <span>Log out</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 ml-56">
        {prototypeMode && (
          <div className="bg-amber-500 text-white py-2 px-6 text-center text-xs font-medium">
            🎨 PROTOTYPE MODE
          </div>
        )}

        <div className="flex items-center justify-end px-6 pt-4">
          <button
            onClick={() => setCurrentPage('profile')}
            className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
            title="View profile"
          >
            <Avatar className="size-9">
              {user?.profileImageUrl && (
                <AvatarImage
                  src={user.profileImageUrl}
                  alt={user.username || 'Profile'}
                  className="object-cover"
                  style={{ objectPosition: 'center' }}
                />
              )}
              <AvatarFallback
                className="bg-gray-200 text-gray-700 text-xs font-semibold"
                style={
                  user?.profileImageUrl
                    ? {
                        backgroundImage: `url(${user.profileImageUrl})`,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center'
                      }
                    : undefined
                }
              >
                {!user?.profileImageUrl ? getInitials(user?.username, user?.email) : null}
              </AvatarFallback>
            </Avatar>
          </button>
        </div>
        
        <main className="p-6">
          {currentPage === 'dashboard' && (
            <DashboardPage accessToken={accessToken} />
          )}
          {currentPage === 'study-groups' && (
            <StudyGroupsPage
              accessToken={accessToken}
              userId={user?.id || ''}
              currentUserUsername={user?.username}
              onJoinRoom={navigateToRoom}
            />
          )}
          {currentPage === 'room' && currentGroupId && (
            <StudyRoomPage
              groupId={currentGroupId}
              accessToken={accessToken}
              onBack={() => navigateTo('study-groups')}
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
      </div>

      <Toaster />
    </div>
  );
}