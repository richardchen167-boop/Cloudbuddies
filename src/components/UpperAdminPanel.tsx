import { useState, useEffect } from 'react';
import { X, Shield, Ban, Trash2, UserX, AlertTriangle } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface UserWithSettings {
  user_id: string;
  username: string;
  display_name: string;
  is_admin: boolean;
  is_super_admin: boolean;
  is_banned: boolean;
  pet_count: number;
}

interface UpperAdminPanelProps {
  onClose: () => void;
  currentUserId: string;
  isSuperAdmin: boolean;
}

export function UpperAdminPanel({ onClose, currentUserId, isSuperAdmin }: UpperAdminPanelProps) {
  const [users, setUsers] = useState<UserWithSettings[]>([]);
  const [loading, setLoading] = useState(true);
  const [showConfirmDelete, setShowConfirmDelete] = useState<string | null>(null);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      setLoading(true);

      const { data: userSettings } = await supabase
        .from('user_settings')
        .select('user_id, username, display_name')
        .order('username');

      const { data: admins } = await supabase
        .from('admin_users')
        .select('user_id, is_super_admin');

      const { data: banned } = await supabase
        .from('banned_users')
        .select('user_id')
        .eq('is_active', true);

      const { data: petCounts } = await supabase
        .from('pets')
        .select('user_id');

      const petCountMap = petCounts?.reduce((acc, pet) => {
        acc[pet.user_id] = (acc[pet.user_id] || 0) + 1;
        return acc;
      }, {} as Record<string, number>) || {};

      const adminMap = admins?.reduce((acc, admin) => {
        acc[admin.user_id] = { isAdmin: true, isSuperAdmin: admin.is_super_admin };
        return acc;
      }, {} as Record<string, { isAdmin: boolean; isSuperAdmin: boolean }>) || {};

      const bannedSet = new Set(banned?.map(b => b.user_id) || []);

      const usersWithData: UserWithSettings[] = (userSettings || []).map(user => ({
        user_id: user.user_id,
        username: user.username || 'Unknown',
        display_name: user.display_name || '',
        is_admin: adminMap[user.user_id]?.isAdmin || false,
        is_super_admin: adminMap[user.user_id]?.isSuperAdmin || false,
        is_banned: bannedSet.has(user.user_id),
        pet_count: petCountMap[user.user_id] || 0
      }));

      setUsers(usersWithData);
    } catch (error) {
      console.error('Error loading users:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleBanUser = async (userId: string) => {
    try {
      const { data: existing } = await supabase
        .from('banned_users')
        .select('id')
        .eq('user_id', userId)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from('banned_users')
          .update({ is_active: true })
          .eq('user_id', userId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('banned_users')
          .insert({
            user_id: userId,
            banned_by: currentUserId,
            banned_at: new Date().toISOString(),
            reason: '',
            is_active: true
          });
        if (error) throw error;
      }

      loadUsers();
    } catch (error) {
      console.error('Error banning user:', error);
      alert('Failed to ban user: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  };

  const handleUnbanUser = async (userId: string) => {
    try {
      const { error } = await supabase
        .from('banned_users')
        .update({ is_active: false })
        .eq('user_id', userId);

      if (error) throw error;

      loadUsers();
    } catch (error) {
      console.error('Error unbanning user:', error);
      alert('Failed to unban user');
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!isSuperAdmin) {
      alert('Only super admins can delete users');
      return;
    }

    try {
      const { data: existingBan } = await supabase
        .from('banned_users')
        .select('user_id')
        .eq('user_id', userId)
        .maybeSingle();

      if (!existingBan) {
        const { error: banError } = await supabase
          .from('banned_users')
          .insert({
            user_id: userId,
            banned_by: currentUserId,
            banned_at: new Date().toISOString(),
            reason: 'Account deleted by admin',
            is_active: true
          });

        if (banError) throw banError;
      } else {
        const { error: updateBanError } = await supabase
          .from('banned_users')
          .update({
            is_active: true,
            banned_by: currentUserId,
            banned_at: new Date().toISOString(),
            reason: 'Account deleted by admin'
          })
          .eq('user_id', userId);

        if (updateBanError) throw updateBanError;
      }

      const { error: petsError } = await supabase
        .from('pets')
        .delete()
        .eq('user_id', userId);

      if (petsError) throw petsError;

      const { error: settingsError } = await supabase
        .from('user_settings')
        .delete()
        .eq('user_id', userId);

      if (settingsError) throw settingsError;

      setShowConfirmDelete(null);
      loadUsers();
      alert('User deleted and banned successfully');
    } catch (error) {
      console.error('Error deleting user:', error);
      alert('Failed to delete user: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="sticky top-0 bg-gradient-to-r from-red-600 to-rose-600 text-white p-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield size={32} />
            <div>
              <h2 className="text-3xl font-bold">Upper Admin Panel</h2>
              <p className="text-red-100 text-sm mt-1">Manage users, bans, and permissions</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/20 rounded-lg transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="text-center py-12">
              <div className="text-gray-500">Loading users...</div>
            </div>
          ) : (
            <div className="space-y-3">
              {users.map((user) => (
                <div
                  key={user.user_id}
                  className={`p-4 rounded-xl border-2 ${
                    user.is_banned
                      ? 'border-red-300 bg-red-50'
                      : user.is_super_admin
                      ? 'border-purple-300 bg-purple-50'
                      : user.is_admin
                      ? 'border-blue-300 bg-blue-50'
                      : 'border-gray-200 bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-lg">{user.username}</span>
                        {user.is_super_admin && (
                          <span className="bg-purple-500 text-white text-xs px-2 py-1 rounded-full font-bold">
                            SUPER ADMIN
                          </span>
                        )}
                        {user.is_admin && !user.is_super_admin && (
                          <span className="bg-blue-500 text-white text-xs px-2 py-1 rounded-full font-bold">
                            ADMIN
                          </span>
                        )}
                        {user.is_banned && (
                          <span className="bg-red-500 text-white text-xs px-2 py-1 rounded-full font-bold">
                            BANNED
                          </span>
                        )}
                      </div>
                      {user.display_name && (
                        <div className="text-sm text-gray-600 mt-1">{user.display_name}</div>
                      )}
                      <div className="text-xs text-gray-500 mt-1">
                        {user.pet_count} pet{user.pet_count !== 1 ? 's' : ''}
                      </div>
                    </div>

                    {user.user_id !== currentUserId && (
                      <div className="flex items-center gap-2">
                        {user.is_banned ? (
                          <button
                            onClick={() => handleUnbanUser(user.user_id)}
                            className="px-3 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg font-semibold text-sm transition-colors flex items-center gap-2"
                          >
                            <UserX size={16} />
                            Unban
                          </button>
                        ) : (
                          <button
                            onClick={() => handleBanUser(user.user_id)}
                            className="px-3 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-semibold text-sm transition-colors flex items-center gap-2"
                          >
                            <Ban size={16} />
                            Ban
                          </button>
                        )}

                        {isSuperAdmin && (
                          <button
                            onClick={() => setShowConfirmDelete(user.user_id)}
                            className="px-3 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg font-semibold text-sm transition-colors flex items-center gap-2"
                          >
                            <Trash2 size={16} />
                            Delete
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showConfirmDelete && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-[60]">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full">
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle className="text-red-500" size={32} />
              <h3 className="text-xl font-bold">Delete User</h3>
            </div>
            <p className="text-gray-600 mb-4">
              This will permanently delete all of this user's pets and data. This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirmDelete(null)}
                className="flex-1 px-4 py-3 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-xl font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteUser(showConfirmDelete)}
                className="flex-1 px-4 py-3 bg-red-500 hover:bg-red-600 text-white rounded-xl font-semibold transition-colors"
              >
                Delete Forever
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
