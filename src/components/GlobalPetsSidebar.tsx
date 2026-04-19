import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Users, Clock, ArrowRightLeft, Ban, Search, UserPlus, Check, X } from 'lucide-react';
import { getUserSessionTime, formatTimeSpent } from '../hooks/useTimeTracking';
import { ProfileModal } from './ProfileModal';
import { AnimatedSleigh } from './AnimatedSleigh';

interface UserInfo {
  userId: string;
  username: string;
  displayName: string | null;
  petCount: number;
  tradesEnabled: boolean;
  isBanned: boolean;
}

interface GlobalPetsSidebarProps {
  currentUserId?: string;
  isUpperAdmin?: boolean;
  isNovember?: boolean;
  isDecember?: boolean;
  onTradeInitiate?: (userId: string, userName: string) => void;
}

interface BannedUser {
  userId: string;
  username: string;
  displayName: string | null;
}

interface Snowflake {
  id: number;
  left: number;
  animationDuration: number;
  size: number;
  delay: number;
}

type FriendStatus = 'none' | 'pending_sent' | 'pending_received' | 'friends';

interface FriendStatuses {
  [userId: string]: FriendStatus;
}

export function GlobalPetsSidebar({ currentUserId, isUpperAdmin, isNovember, isDecember, onTradeInitiate }: GlobalPetsSidebarProps) {
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [bannedUsers, setBannedUsers] = useState<BannedUser[]>([]);
  const [uniqueUserCount, setUniqueUserCount] = useState(0);
  const [isExpanded, setIsExpanded] = useState(false);
  const [showBanned, setShowBanned] = useState(false);
  const [ownerTimes, setOwnerTimes] = useState<Record<string, number>>({});
  const [selectedProfile, setSelectedProfile] = useState<{ userId: string; ownerName: string } | null>(null);
  const [snowflakes, setSnowflakes] = useState<Snowflake[]>([]);
  const [unbanNotice, setUnbanNotice] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [friendStatuses, setFriendStatuses] = useState<FriendStatuses>({});
  const [friendActionLoading, setFriendActionLoading] = useState<string | null>(null);

  useEffect(() => {
    loadAllUsers();
    const interval = setInterval(loadAllUsers, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (currentUserId) {
      loadFriendStatuses();
    }
  }, [currentUserId, users]);

  useEffect(() => {
    if (isDecember) {
      const flakes: Snowflake[] = Array.from({ length: 50 }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        animationDuration: 10 + Math.random() * 20,
        size: 10 + Math.random() * 20,
        delay: Math.random() * 10
      }));
      setSnowflakes(flakes);
    }
  }, [isDecember]);

  const loadAllUsers = async () => {
    try {
      const { data: allUsers, error } = await supabase
        .from('user_settings')
        .select('user_id')
        .order('username', { ascending: true });

      if (error) throw error;

      const uniqueUserIds = allUsers?.map(u => u.user_id) || [];

      const times: Record<string, number> = {};
      const userInfos: UserInfo[] = [];
      const banned: BannedUser[] = [];

      for (const userId of uniqueUserIds) {
        times[userId] = await getUserSessionTime(userId);

        const { data: settingsData } = await supabase
          .from('user_settings')
          .select('*')
          .eq('user_id', userId)
          .maybeSingle();

        const { data: userPets } = await supabase
          .from('pets')
          .select('id')
          .eq('user_id', userId);

        const { data: banData } = await supabase
          .from('banned_users')
          .select('is_active')
          .eq('user_id', userId)
          .maybeSingle();

        const isBanned = banData?.is_active || false;

        if (isBanned) {
          banned.push({
            userId,
            username: settingsData?.username || 'Anonymous',
            displayName: settingsData?.display_name || null
          });
        } else {
          userInfos.push({
            userId,
            username: settingsData?.username || 'Anonymous',
            displayName: settingsData?.display_name || null,
            petCount: userPets?.length || 0,
            tradesEnabled: settingsData?.trades_enabled || false,
            isBanned: false
          });
        }
      }

      setOwnerTimes(times);
      setUsers(userInfos);
      setBannedUsers(banned);
      setUniqueUserCount(userInfos.length);
    } catch (error) {
      console.error('Error loading users:', error);
    }
  };

  const loadFriendStatuses = async () => {
    if (!currentUserId) return;
    try {
      const { data: friendRows } = await supabase
        .from('friends')
        .select('*')
        .or(`requester_id.eq.${currentUserId},addressee_id.eq.${currentUserId}`);

      const statuses: FriendStatuses = {};
      for (const row of friendRows || []) {
        const otherId = row.requester_id === currentUserId ? row.addressee_id : row.requester_id;
        if (row.status === 'accepted') {
          statuses[otherId] = 'friends';
        } else if (row.status === 'pending') {
          statuses[otherId] = row.requester_id === currentUserId ? 'pending_sent' : 'pending_received';
        }
      }
      setFriendStatuses(statuses);
    } catch (error) {
      console.error('Error loading friend statuses:', error);
    }
  };

  const handleAddFriend = async (targetUserId: string) => {
    if (!currentUserId || friendActionLoading) return;
    setFriendActionLoading(targetUserId);
    try {
      const status = friendStatuses[targetUserId];

      if (status === 'pending_sent') {
        await supabase
          .from('friends')
          .delete()
          .eq('requester_id', currentUserId)
          .eq('addressee_id', targetUserId);
      } else if (status === 'pending_received') {
        await supabase
          .from('friends')
          .update({ status: 'accepted', updated_at: new Date().toISOString() })
          .eq('requester_id', targetUserId)
          .eq('addressee_id', currentUserId);
      } else if (status === 'friends') {
        await supabase
          .from('friends')
          .delete()
          .or(`and(requester_id.eq.${currentUserId},addressee_id.eq.${targetUserId}),and(requester_id.eq.${targetUserId},addressee_id.eq.${currentUserId})`);
      } else {
        await supabase
          .from('friends')
          .insert({ requester_id: currentUserId, addressee_id: targetUserId, status: 'pending' });
      }

      await loadFriendStatuses();
    } catch (error) {
      console.error('Error managing friend:', error);
    } finally {
      setFriendActionLoading(null);
    }
  };

  const handleBanUser = async (userId: string) => {
    if (!currentUserId) return;

    try {
      await supabase
        .from('banned_users')
        .upsert({
          user_id: userId,
          banned_by: currentUserId,
          reason: '',
          is_active: true
        });

      await loadAllUsers();
    } catch (error) {
      console.error('Error banning user:', error);
    }
  };

  const handleUnbanUser = async (userId: string) => {
    if (!currentUserId) return;

    try {
      await supabase
        .from('banned_users')
        .update({ is_active: false })
        .eq('user_id', userId);

      const bannedUser = users.find(u => u.userId === userId);
      const username = bannedUser?.displayName || bannedUser?.username || 'User';
      setUnbanNotice(`${username} has been unbanned!`);
      setTimeout(() => setUnbanNotice(null), 3000);

      await loadAllUsers();
    } catch (error) {
      console.error('Error unbanning user:', error);
    }
  };

  const getFriendButtonLabel = (status: FriendStatus | undefined) => {
    switch (status) {
      case 'friends': return 'Friends';
      case 'pending_sent': return 'Requested';
      case 'pending_received': return 'Accept';
      default: return 'Add Friend';
    }
  };

  const getFriendButtonStyle = (status: FriendStatus | undefined) => {
    switch (status) {
      case 'friends':
        return 'bg-gradient-to-r from-green-500 to-emerald-500 hover:from-red-500 hover:to-rose-500 text-white';
      case 'pending_sent':
        return 'bg-gray-100 hover:bg-red-50 text-gray-600 hover:text-red-600 border-2 border-gray-200 hover:border-red-200';
      case 'pending_received':
        return 'bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white animate-pulse';
      default:
        return 'bg-white hover:bg-blue-50 text-blue-600 border-2 border-blue-200 hover:border-blue-400';
    }
  };

  const trimmedQuery = searchQuery.trim().toLowerCase();
  const filteredUsers = trimmedQuery.length > 0
    ? users.filter(u =>
        (u.username || '').toLowerCase().includes(trimmedQuery) ||
        (u.displayName || '').toLowerCase().includes(trimmedQuery)
      )
    : [];

  return (
    <>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={`fixed top-4 left-72 bg-white/90 backdrop-blur-sm hover:bg-gray-50 text-gray-700 px-4 py-3 rounded-xl shadow-lg transition-all hover:scale-105 z-50 flex items-center gap-2 border-2 ${isNovember ? 'border-amber-300' : isDecember ? 'border-red-300' : 'border-cyan-200'}`}
        title="View all users"
      >
        <Users size={20} />
        <span className="font-semibold text-gray-800">All Users ({uniqueUserCount})</span>
      </button>

      {isExpanded && (
        <>
          <div
            className={`fixed inset-0 z-40 ${isDecember ? 'bg-gradient-to-br from-red-50 via-green-50 to-blue-50' : 'bg-gradient-to-br from-blue-50 via-cyan-50 to-teal-50'}`}
            onClick={() => setIsExpanded(false)}
          />
          <div className="fixed inset-0 pointer-events-none overflow-hidden z-45">
            {isDecember ? (
              <>
                <div className="absolute top-0 left-0 right-0 h-16 flex items-center justify-around">
                  {Array.from({ length: 20 }, (_, i) => ({
                    id: i,
                    color: ['#FF0000', '#00FF00', '#FFD700', '#0000FF', '#FF69B4'][i % 5],
                    delay: i * 0.2
                  })).map((light) => (
                    <div
                      key={light.id}
                      className="w-3 h-5 rounded-full animate-pulse"
                      style={{
                        backgroundColor: light.color,
                        boxShadow: `0 0 10px ${light.color}`,
                        animationDelay: `${light.delay}s`
                      }}
                    />
                  ))}
                </div>

                <div className="absolute bottom-4 left-8 text-6xl animate-bounce" style={{ animationDelay: '0s' }}>
                  🎄
                </div>
                <div className="absolute bottom-4 left-96 text-6xl animate-bounce" style={{ animationDelay: '0.5s' }}>
                  🎄
                </div>

                <AnimatedSleigh />
                <div className="absolute top-32 left-16 text-4xl animate-spin-slow">
                  ❄️
                </div>
                <div className="absolute top-32 right-96 text-4xl animate-spin-slow" style={{ animationDelay: '1s' }}>
                  ❄️
                </div>
                <div className="absolute bottom-32 left-24 text-5xl animate-bounce" style={{ animationDelay: '0.8s' }}>
                  🎅
                </div>
                <div className="absolute bottom-32 right-96 text-5xl animate-bounce" style={{ animationDelay: '0.3s' }}>
                  ⛄
                </div>
                <div className="absolute top-1/3 left-12 text-3xl animate-pulse">
                  🎁
                </div>
                <div className="absolute top-1/3 right-96 text-3xl animate-pulse" style={{ animationDelay: '0.5s' }}>
                  🎁
                </div>
                <div className="absolute top-2/3 left-32 text-3xl animate-bounce" style={{ animationDelay: '0.6s' }}>
                  🦌
                </div>
                <div className="absolute bottom-16 right-96 text-4xl animate-pulse" style={{ animationDelay: '1s' }}>
                  ⭐
                </div>
                <div className="absolute top-48 left-1/4 text-3xl animate-bounce" style={{ animationDelay: '0.4s' }}>
                  🔔
                </div>
                <div className="absolute bottom-48 left-48 text-3xl animate-bounce" style={{ animationDelay: '0.7s' }}>
                  🕯️
                </div>

                {snowflakes.map((flake) => (
                  <div
                    key={flake.id}
                    className="absolute text-white opacity-80 animate-fall"
                    style={{
                      left: `${flake.left}%`,
                      fontSize: `${flake.size}px`,
                      animationDuration: `${flake.animationDuration}s`,
                      animationDelay: `${flake.delay}s`
                    }}
                  >
                    ❄
                  </div>
                ))}
              </>
            ) : (
              <>
                {[...Array(12)].map((_, i) => (
                  <div
                    key={i}
                    className="absolute animate-float-up opacity-40"
                    style={{
                      left: `${10 + Math.random() * 70}%`,
                      bottom: '-50px',
                      animationDelay: `${Math.random() * 5}s`,
                      animationDuration: `${8 + Math.random() * 4}s`,
                      fontSize: '2rem'
                    }}
                  >
                    {['🐾', '🐕', '🐈', '🐇', '🐹', '🦊', '🐦', '🐉', '🦈', '🐢', '🐠', '🦜'][i]}
                  </div>
                ))}
              </>
            )}
            <style>{`
              @keyframes float-up {
                0% {
                  transform: translateY(0) rotate(0deg);
                  opacity: 0;
                }
                10% {
                  opacity: 0.4;
                }
                90% {
                  opacity: 0.4;
                }
                100% {
                  transform: translateY(-100vh) rotate(360deg);
                  opacity: 0;
                }
              }
              .animate-float-up {
                animation: float-up linear infinite;
              }
              @keyframes fall {
                0% {
                  transform: translateY(-10vh) rotate(0deg);
                }
                100% {
                  transform: translateY(110vh) rotate(360deg);
                }
              }
              @keyframes spin-slow {
                from {
                  transform: rotate(0deg);
                }
                to {
                  transform: rotate(360deg);
                }
              }
              .animate-fall {
                animation: fall linear infinite;
              }
              .animate-spin-slow {
                animation: spin-slow 8s linear infinite;
              }
              @keyframes sleigh-ride {
                0% {
                  left: -400px;
                }
                50% {
                  left: calc(100% + 100px);
                }
                50.01% {
                  left: calc(100% + 100px);
                }
                100% {
                  left: -400px;
                }
              }
              .animate-sleigh-ride {
                animation: sleigh-ride 20s linear infinite;
              }
            `}</style>
          </div>
          <div className="fixed top-0 right-0 h-full w-80 bg-white shadow-2xl z-50 overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            {unbanNotice && (
              <div className="bg-green-100 border-l-4 border-green-500 text-green-700 p-3 m-3 rounded">
                <p className="text-sm font-semibold">{unbanNotice}</p>
              </div>
            )}
            <div className={`sticky top-0 text-white p-4 flex items-center justify-between ${isDecember ? 'bg-gradient-to-r from-red-600 to-green-600' : 'bg-gradient-to-r from-blue-500 to-cyan-500'}`}>
              <div className="flex items-center gap-2">
                <Users size={24} />
                <h2 className="text-xl font-bold">{showBanned ? 'Banned Users' : 'All Users'}</h2>
              </div>
              <button
                onClick={() => setIsExpanded(false)}
                className="text-white hover:text-gray-200 text-2xl"
              >
                ×
              </button>
            </div>

            {!showBanned && (
              <div className="sticky top-[60px] bg-white border-b border-gray-100 px-4 py-3 z-10">
                <div className="relative">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by username..."
                    className="w-full pl-9 pr-4 py-2.5 bg-gray-50 border-2 border-gray-200 rounded-xl text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:border-blue-400 transition-colors"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              </div>
            )}

            {isUpperAdmin && bannedUsers.length > 0 && (
              <div className="bg-gradient-to-r from-red-50 to-rose-50 border-b-2 border-red-200 p-3">
                <button
                  onClick={() => setShowBanned(!showBanned)}
                  className="text-sm font-semibold text-red-600 hover:text-red-700"
                >
                  {showBanned ? '← Back to Active Users' : `View Banned (${bannedUsers.length})`}
                </button>
              </div>
            )}

            <div className="p-4 space-y-3">
              {showBanned ? (
                bannedUsers.length === 0 ? (
                  <div className="text-center text-gray-500 py-8">
                    <div className="text-4xl mb-2">🚫</div>
                    <p>No banned users</p>
                  </div>
                ) : (
                  bannedUsers.map((user) => (
                    <div
                      key={user.userId}
                      className="bg-gradient-to-br from-red-50 to-rose-50 rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow"
                    >
                      <div className="flex items-start gap-3">
                        <div className="text-4xl">🚫</div>
                        <div className="flex-1">
                          <h3 className="font-bold text-gray-800 text-lg">
                            {user.displayName || user.username}
                          </h3>
                          {user.displayName && (
                            <p className="text-xs text-gray-500">@{user.username}</p>
                          )}
                        </div>
                      </div>
                      {isUpperAdmin && (
                        <div className="mt-3 flex gap-2">
                          <button
                            onClick={() => handleUnbanUser(user.userId)}
                            className="flex-1 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white px-4 py-2 rounded-lg font-semibold text-sm transition-colors"
                          >
                            Unban
                          </button>
                        </div>
                      )}
                    </div>
                  ))
                )
              ) : trimmedQuery.length === 0 ? (
                <div className="text-center py-12 px-4">
                  <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Search size={28} className="text-blue-400" />
                  </div>
                  <p className="text-gray-700 font-semibold mb-1">Search for a user</p>
                  <p className="text-sm text-gray-400">Type a username above to find and connect with other players.</p>
                </div>
              ) : filteredUsers.length === 0 ? (
                <div className="text-center py-10">
                  <div className="text-4xl mb-2">🔍</div>
                  <p className="text-gray-500 font-medium">No users found</p>
                  <p className="text-sm text-gray-400 mt-1">Try a different username</p>
                </div>
              ) : (
                filteredUsers.map((user) => (
                  <div
                    key={user.userId}
                    className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-start gap-3">
                      <div className="text-4xl">👤</div>
                      <div className="flex-1">
                        <h3 className="font-bold text-gray-800 text-lg">
                          {user.displayName || user.username}
                        </h3>
                        {user.displayName && (
                          <p className="text-xs text-gray-500">@{user.username}</p>
                        )}
                        <div className="flex items-center gap-1 text-xs text-cyan-600 mt-1">
                          <Clock size={12} />
                          <span>{formatTimeSpent(ownerTimes[user.userId] || 0)}</span>
                        </div>
                        <div className="text-xs text-gray-600 mt-1">
                          {user.petCount} {user.petCount === 1 ? 'pet' : 'pets'}
                        </div>
                        {user.tradesEnabled && (
                          <div className="flex items-center gap-1 text-xs text-green-600 mt-1">
                            <ArrowRightLeft size={12} />
                            <span>Trading enabled</span>
                          </div>
                        )}
                        {friendStatuses[user.userId] === 'friends' && (
                          <div className="flex items-center gap-1 text-xs text-emerald-600 mt-1">
                            <Check size={12} />
                            <span>Friends</span>
                          </div>
                        )}
                        {friendStatuses[user.userId] === 'pending_received' && (
                          <div className="flex items-center gap-1 text-xs text-blue-600 mt-1 font-semibold">
                            <UserPlus size={12} />
                            <span>Wants to be friends</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={() => setSelectedProfile({ userId: user.userId, ownerName: user.displayName || user.username })}
                        className="flex-1 bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white px-3 py-2 rounded-lg font-semibold text-sm transition-colors"
                      >
                        View Profile
                      </button>
                      {currentUserId && user.userId !== currentUserId && (
                        <button
                          onClick={() => handleAddFriend(user.userId)}
                          disabled={friendActionLoading === user.userId}
                          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg font-semibold text-sm transition-all ${getFriendButtonStyle(friendStatuses[user.userId])} ${friendActionLoading === user.userId ? 'opacity-60 cursor-not-allowed' : ''}`}
                          title={getFriendButtonLabel(friendStatuses[user.userId])}
                        >
                          <UserPlus size={14} />
                          <span className="hidden sm:inline">{getFriendButtonLabel(friendStatuses[user.userId])}</span>
                        </button>
                      )}
                      {isUpperAdmin && user.userId !== currentUserId && (
                        <button
                          onClick={() => handleBanUser(user.userId)}
                          className="flex items-center gap-1 bg-gradient-to-r from-red-500 to-rose-500 hover:from-red-600 hover:to-rose-600 text-white px-3 py-2 rounded-lg font-semibold text-sm transition-colors"
                          title="Ban user"
                        >
                          <Ban size={16} />
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}

      {selectedProfile && (
        <ProfileModal
          userId={selectedProfile.userId}
          ownerName={selectedProfile.ownerName}
          onClose={() => setSelectedProfile(null)}
          onTradeClick={() => {
            onTradeInitiate?.(selectedProfile.userId, selectedProfile.ownerName);
            setSelectedProfile(null);
          }}
        />
      )}
    </>
  );
}
