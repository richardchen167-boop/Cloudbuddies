import { useState, useEffect } from 'react';
import { supabase, type Pet, type UserSettings } from '../lib/supabase';
import { X, CreditCard as Edit2, Save, UserPlus, UserMinus, Gift, Lock, Eye, EyeOff, Check } from 'lucide-react';
import { getUserSessionTime, formatTimeSpent } from '../hooks/useTimeTracking';

const PET_EMOJIS: Record<Pet['type'], string> = {
  cat: '🐱',
  dog: '🐶',
  fox: '🦊',
  bird: '🐦',
  rabbit: '🐰',
  bear: '🐻',
  panda: '🐼',
  koala: '🐨',
  hamster: '🐹',
  mouse: '🐭',
  pig: '🐷',
  frog: '🐸',
  monkey: '🐵',
  lion: '🦁',
  tiger: '🐯',
  cow: '🐮',
  turkey: '🦃',
  dragon: '🐉',
  shark: '🦈',
  seal: '🦭',
  crocodile: '🐊',
  flamingo: '🦩',
  duck: '🦆',
  turtle: '🐢',
  butterfly: '🦋',
  elephant: '🐘',
  giraffe: '🦒',
  dinosaur: '🦕',
  crab: '🦀',
  lobster: '🦞',
  shrimp: '🦐',
  squid: '🦑',
  octopus: '🐙',
  pufferfish: '🐡',
  eagle: '🦅',
  owl: '🦉',
  bat: '🦇',
  bee: '🐝',
  unicorn: '🦄',
  boar: '🐗',
  dolphin: '🐬',
  whale: '🐳',
  leopard: '🐆',
  swan: '🦢',
  parrot: '🦜',
  badger: '🦡',
  rat: '🐀',
  squirrel: '🐿',
  hedgehog: '🦔',
  rhino: '🦏',
  waterbuffalo: '🐃',
  kangaroo: '🦘',
  camel: '🐫',
  dromedary: '🐪',
  ox: '🐂',
  horse: '🐎',
  ram: '🐏',
  deer: '🦌',
  goat: '🐐',
  sheep: '🐑'
};

interface ProfileModalProps {
  userId: string;
  ownerName: string;
  onClose: () => void;
  onTradeClick?: () => void;
}

type ActiveTab = 'profile' | 'password';

export function ProfileModal({ userId, ownerName, onClose, onTradeClick }: ProfileModalProps) {
  const [userPets, setUserPets] = useState<Pet[]>([]);
  const [userSettings, setUserSettings] = useState<UserSettings | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedBio, setEditedBio] = useState('');
  const [editedDisplayName, setEditedDisplayName] = useState('');
  const [totalTime, setTotalTime] = useState(0);
  const [loading, setLoading] = useState(true);
  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [isFollowing, setIsFollowing] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [selectedPetsForBio, setSelectedPetsForBio] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<ActiveTab>('profile');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  useEffect(() => {
    loadProfile();

    const intervalId = setInterval(async () => {
      const time = await getUserSessionTime(userId);
      setTotalTime(time);
    }, 1000);

    return () => {
      clearInterval(intervalId);
    };
  }, [userId]);

  const loadProfile = async () => {
    try {
      setLoading(true);

      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUserId(user?.id || null);

      const { data: pets } = await supabase
        .from('pets')
        .select('*')
        .eq('user_id', userId)
        .order('level', { ascending: false });

      setUserPets(pets || []);

      const { data: settings } = await supabase
        .from('user_settings')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (settings) {
        setUserSettings(settings);
        setEditedBio(settings.bio || '');
        setEditedDisplayName(settings.display_name || '');
        try {
          const bioData = settings.bio ? JSON.parse(settings.bio) : null;
          if (bioData && bioData.featured_pets) {
            setSelectedPetsForBio(bioData.featured_pets);
            setEditedBio(bioData.text || '');
          }
        } catch {
          // Bio is plain text, not JSON
        }
      }

      const time = await getUserSessionTime(userId);
      setTotalTime(time);

      const { count: followersC } = await supabase
        .from('user_followers')
        .select('*', { count: 'exact', head: true })
        .eq('following_id', userId);

      setFollowersCount(followersC || 0);

      const { count: followingC } = await supabase
        .from('user_followers')
        .select('*', { count: 'exact', head: true })
        .eq('follower_id', userId);

      setFollowingCount(followingC || 0);

      if (user?.id && user.id !== userId) {
        const { data: followData } = await supabase
          .from('user_followers')
          .select('id')
          .eq('follower_id', user.id)
          .eq('following_id', userId)
          .maybeSingle();

        setIsFollowing(!!followData);
      } else {
        setIsFollowing(false);
      }
    } catch (error) {
      console.error('Error loading profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveProfile = async () => {
    if (!currentUserId || currentUserId !== userId) return;

    try {
      const bioData = {
        text: editedBio,
        featured_pets: selectedPetsForBio,
        show_stats: showStats
      };

      const { error } = await supabase
        .from('user_settings')
        .upsert({
          user_id: userId,
          bio: JSON.stringify(bioData),
          display_name: editedDisplayName || null,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'user_id'
        });

      if (error) throw error;

      await loadProfile();
      setIsEditing(false);
    } catch (error) {
      console.error('Error saving profile:', error);
      alert('Failed to save profile');
    }
  };

  const handleFollow = async () => {
    if (!currentUserId || currentUserId === userId) return;

    try {
      if (isFollowing) {
        await supabase
          .from('user_followers')
          .delete()
          .eq('follower_id', currentUserId)
          .eq('following_id', userId);
      } else {
        await supabase
          .from('user_followers')
          .insert({
            follower_id: currentUserId,
            following_id: userId
          });
      }

      await loadProfile();
    } catch (error) {
      console.error('Error following/unfollowing user:', error);
      alert('Failed to update follow status');
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess(false);

    if (newPassword.length < 6) {
      setPasswordError('New password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match.');
      return;
    }

    setPasswordLoading(true);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: (await supabase.auth.getUser()).data.user?.email || '',
        password: currentPassword,
      });

      if (signInError) {
        setPasswordError('Current password is incorrect.');
        setPasswordLoading(false);
        return;
      }

      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;

      setPasswordSuccess(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setPasswordError(err.message || 'Failed to change password.');
    } finally {
      setPasswordLoading(false);
    }
  };

  const isOwnProfile = currentUserId === userId;
  const displayName = userSettings?.display_name || userSettings?.username || ownerName;
  const actualUsername = userSettings?.username || ownerName;
  const canTrade = !isOwnProfile && currentUserId && userSettings?.trades_enabled;

  return (
    <>
      <div
        className="fixed inset-0 bg-black bg-opacity-50 z-50"
        onClick={onClose}
      />
      <div className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-full max-w-2xl bg-white rounded-2xl shadow-2xl z-50 max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-gradient-to-r from-blue-500 to-cyan-500 text-white p-6 rounded-t-2xl">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-2xl font-bold">{displayName}</h2>
              {userSettings?.display_name && (
                <p className="text-sm text-blue-100">@{actualUsername}</p>
              )}
            </div>
            <button
              onClick={onClose}
              className="text-white hover:text-gray-200 transition-colors"
            >
              <X size={24} />
            </button>
          </div>
          {!isOwnProfile && currentUserId && (
            <div className="flex gap-2">
              {canTrade && (
                <button
                  onClick={onTradeClick}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-colors bg-pink-500 hover:bg-pink-600 text-white"
                >
                  <Gift size={18} />
                  Trade
                </button>
              )}
              <button
                onClick={handleFollow}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-colors ${
                  isFollowing
                    ? 'bg-white/20 hover:bg-white/30 text-white'
                    : 'bg-white text-blue-600 hover:bg-blue-50'
                }`}
              >
                {isFollowing ? (
                  <>
                    <UserMinus size={18} />
                    Unfollow
                  </>
                ) : (
                  <>
                    <UserPlus size={18} />
                    Follow
                  </>
                )}
              </button>
            </div>
          )}

          {isOwnProfile && (
            <div className="flex gap-1 mt-3 bg-white/10 rounded-xl p-1">
              <button
                onClick={() => setActiveTab('profile')}
                className={`flex-1 py-2 px-3 rounded-lg text-sm font-semibold transition-all ${
                  activeTab === 'profile'
                    ? 'bg-white text-blue-600 shadow'
                    : 'text-white hover:bg-white/10'
                }`}
              >
                Profile
              </button>
              <button
                onClick={() => setActiveTab('password')}
                className={`flex-1 py-2 px-3 rounded-lg text-sm font-semibold transition-all flex items-center justify-center gap-2 ${
                  activeTab === 'password'
                    ? 'bg-white text-blue-600 shadow'
                    : 'text-white hover:bg-white/10'
                }`}
              >
                <Lock size={14} />
                Change Password
              </button>
            </div>
          )}
        </div>

        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading profile...</div>
        ) : activeTab === 'password' && isOwnProfile ? (
          <div className="p-6">
            <div className="max-w-md mx-auto">
              <h3 className="text-lg font-bold text-gray-800 mb-1">Change Password</h3>
              <p className="text-sm text-gray-500 mb-6">Enter your current password to set a new one.</p>

              {passwordSuccess && (
                <div className="flex items-center gap-2 bg-green-50 border-2 border-green-200 rounded-xl p-4 mb-4 text-green-700">
                  <Check size={18} />
                  <span className="font-semibold">Password changed successfully!</span>
                </div>
              )}
              {passwordError && (
                <div className="bg-red-50 border-2 border-red-200 rounded-xl p-4 mb-4 text-red-700 text-sm">
                  {passwordError}
                </div>
              )}

              <form onSubmit={handleChangePassword} className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Current Password</label>
                  <div className="relative">
                    <input
                      type={showCurrentPw ? 'text' : 'password'}
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      required
                      placeholder="Enter current password"
                      className="w-full px-4 py-3 pr-12 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none transition-colors text-gray-900"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrentPw(!showCurrentPw)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showCurrentPw ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">New Password</label>
                  <div className="relative">
                    <input
                      type={showNewPw ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                      minLength={6}
                      placeholder="Min. 6 characters"
                      className="w-full px-4 py-3 pr-12 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none transition-colors text-gray-900"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPw(!showNewPw)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showNewPw ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Confirm New Password</label>
                  <div className="relative">
                    <input
                      type={showConfirmPw ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      placeholder="Repeat new password"
                      className="w-full px-4 py-3 pr-12 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none transition-colors text-gray-900"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPw(!showConfirmPw)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showConfirmPw ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={passwordLoading}
                  className="w-full py-3 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 disabled:from-gray-300 disabled:to-gray-400 text-white rounded-xl font-semibold transition-all shadow-md disabled:shadow-none"
                >
                  {passwordLoading ? 'Updating...' : 'Update Password'}
                </button>
              </form>
            </div>
          </div>
        ) : (
          <div className="p-6 space-y-6">
            <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-gray-800">About Me</h3>
                {isOwnProfile && !isEditing && (
                  <button
                    onClick={() => setIsEditing(true)}
                    className="text-blue-600 hover:text-blue-700 flex items-center gap-1 text-sm"
                  >
                    <Edit2 size={14} />
                    Edit
                  </button>
                )}
                {isOwnProfile && isEditing && (
                  <button
                    onClick={saveProfile}
                    className="text-green-600 hover:text-green-700 flex items-center gap-1 text-sm"
                  >
                    <Save size={14} />
                    Save
                  </button>
                )}
              </div>

              {isEditing ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Display Name (optional)
                    </label>
                    <input
                      type="text"
                      value={editedDisplayName}
                      onChange={(e) => setEditedDisplayName(e.target.value)}
                      placeholder={ownerName}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      maxLength={50}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Bio
                    </label>
                    <textarea
                      value={editedBio}
                      onChange={(e) => setEditedBio(e.target.value)}
                      placeholder="Tell others about yourself..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                      rows={4}
                      maxLength={500}
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      {editedBio.length}/500 characters
                    </p>
                  </div>
                  <div className="border-t pt-4">
                    <div className="flex items-center justify-between mb-3">
                      <label className="text-sm font-medium text-gray-700">Featured Pets & Stats</label>
                      <button
                        onClick={() => setShowStats(!showStats)}
                        className={`px-2 py-1 rounded text-xs font-semibold transition-colors ${
                          showStats
                            ? 'bg-blue-500 text-white'
                            : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                        }`}
                      >
                        {showStats ? 'Hide' : 'Show'} Stats
                      </button>
                    </div>
                    <p className="text-xs text-gray-500 mb-2">Select up to 3 pets to feature on your profile</p>
                    <div className="grid grid-cols-3 gap-2 max-h-48 overflow-y-auto">
                      {userPets.map((pet) => (
                        <button
                          key={pet.id}
                          onClick={() => {
                            if (selectedPetsForBio.includes(pet.id)) {
                              setSelectedPetsForBio(selectedPetsForBio.filter(id => id !== pet.id));
                            } else if (selectedPetsForBio.length < 3) {
                              setSelectedPetsForBio([...selectedPetsForBio, pet.id]);
                            }
                          }}
                          className={`p-2 rounded-lg border-2 transition-all text-center ${
                            selectedPetsForBio.includes(pet.id)
                              ? 'border-blue-500 bg-blue-50'
                              : 'border-gray-200 bg-gray-50 hover:border-gray-300'
                          } ${selectedPetsForBio.length >= 3 && !selectedPetsForBio.includes(pet.id) ? 'opacity-50 cursor-not-allowed' : ''}`}
                          disabled={selectedPetsForBio.length >= 3 && !selectedPetsForBio.includes(pet.id)}
                        >
                          <div className="text-2xl">{PET_EMOJIS[pet.type]}</div>
                          <div className="text-xs font-bold text-gray-800 truncate">{pet.name}</div>
                          <div className="text-xs text-gray-600">Lv.{pet.level}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div>
                  <p className="text-gray-700 whitespace-pre-wrap mb-2">
                    {typeof userSettings?.bio === 'string' ?
                      (() => {
                        try {
                          const bioData = JSON.parse(userSettings.bio);
                          return bioData.text || 'No bio yet.';
                        } catch {
                          return userSettings.bio || 'No bio yet.';
                        }
                      })()
                      : 'No bio yet.'
                    }
                  </p>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div className="bg-white border-2 border-blue-100 rounded-xl p-4 text-center">
                <div className="text-2xl font-bold text-blue-600">
                  {userPets.length}
                </div>
                <div className="text-sm text-gray-600">Pets</div>
              </div>
              <div className="bg-white border-2 border-sky-100 rounded-xl p-4 text-center">
                <div className="text-2xl font-bold text-sky-600">
                  {followersCount}
                </div>
                <div className="text-sm text-gray-600">Followers</div>
              </div>
              <div className="bg-white border-2 border-pink-100 rounded-xl p-4 text-center">
                <div className="text-2xl font-bold text-pink-600">
                  {followingCount}
                </div>
                <div className="text-sm text-gray-600">Following</div>
              </div>
              <div className="bg-white border-2 border-cyan-100 rounded-xl p-4 text-center">
                <div className="text-2xl font-bold text-cyan-600">
                  {userPets.reduce((sum, pet) => sum + pet.level, 0)}
                </div>
                <div className="text-sm text-gray-600">Total Levels</div>
              </div>
              <div className="bg-white border-2 border-green-100 rounded-xl p-4 text-center">
                <div className="text-2xl font-bold text-green-600">
                  {formatTimeSpent(totalTime)}
                </div>
                <div className="text-sm text-gray-600">Time Spent</div>
              </div>
            </div>

            {!isEditing && selectedPetsForBio.length > 0 && (
              <div className="bg-gradient-to-br from-yellow-50 to-amber-50 rounded-xl p-4">
                <h3 className="font-bold text-gray-800 mb-3">Featured Pets</h3>
                <div className="grid grid-cols-3 gap-3">
                  {selectedPetsForBio.map((petId) => {
                    const pet = userPets.find(p => p.id === petId);
                    if (!pet) return null;
                    return (
                      <div
                        key={pet.id}
                        className="bg-white rounded-xl p-3 text-center border-2 border-yellow-200"
                      >
                        <div className="text-4xl mb-2">{PET_EMOJIS[pet.type]}</div>
                        <h4 className="font-bold text-gray-800 text-sm">{pet.name}</h4>
                        <div className="text-xs text-gray-600 mt-1">Lv. {pet.level}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div>
              <h3 className="font-bold text-gray-800 mb-3">My Pets</h3>
              {userPets.length === 0 ? (
                <div className="text-center text-gray-500 py-8">
                  <div className="text-4xl mb-2">🐾</div>
                  <p>No pets yet</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {userPets.map((pet) => (
                    <div
                      key={pet.id}
                      className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-xl p-3 text-center hover:shadow-md transition-shadow"
                    >
                      <div className="text-4xl mb-2">{PET_EMOJIS[pet.type]}</div>
                      <h4 className="font-bold text-gray-800">{pet.name}</h4>
                      <div className="text-xs text-gray-600 flex items-center justify-center gap-2 mt-1">
                        <span>Lv. {pet.level}</span>
                        <span>•</span>
                        <span>{pet.coins} 🪙</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
