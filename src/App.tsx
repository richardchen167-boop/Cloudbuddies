import { useState, useEffect } from 'react';
import { CirclePlus as PlusCircle, Package, User, ShieldAlert, ShoppingBag } from 'lucide-react';
import { supabase, type Pet, PET_EVENTS, type PetEventType, ACTIVITIES, type ActivityType, type HouseInventoryItem } from './lib/supabase';
import { PetCard } from './components/PetCard';
import { AdoptPetModal } from './components/AdoptPetModal';
import { ShopModal } from './components/ShopModal';
import { ActivitiesModal } from './components/ActivitiesModal';
import { GlobalPetsSidebar } from './components/GlobalPetsSidebar';
import { MusicPlayer } from './components/MusicPlayer';
import { FloatingMusicNotes } from './components/FloatingMusicNotes';
import { ChatPanel } from './components/ChatPanel';
import { House } from './components/House';
import { InventoryModal } from './components/InventoryModal';
import { ProfileModal } from './components/ProfileModal';
import { UpperAdminPanel } from './components/UpperAdminPanel';
import { TradeAcceptModal } from './components/TradeAcceptModal';
import { TradeInitiateModal } from './components/TradeInitiateModal';
import { IncomingTradeNotification } from './components/IncomingTradeNotification';
import { useTimeTracking, formatTimeSpent } from './hooks/useTimeTracking';
import { AuthScreen } from './components/AuthScreen';
import { soundManager } from './lib/sounds';
import { SoundControl } from './components/SoundControl';
import { ChristmasDecorations } from './components/ChristmasDecorations';
import { AnimatedSleigh } from './components/AnimatedSleigh';
import { type TradeRequest } from './lib/supabase';

function App() {
  const [userId, setUserId] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [pets, setPets] = useState<Pet[]>([]);
  const [totalPetCount, setTotalPetCount] = useState(0);
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [showAdoptModal, setShowAdoptModal] = useState(false);
  const [showInventory, setShowInventory] = useState(false);
  const [selectedPetForShop, setSelectedPetForShop] = useState<Pet | null>(null);
  const [selectedPetForActivities, setSelectedPetForActivities] = useState<Pet | null>(null);
  const [actionMessage, setActionMessage] = useState('');
  const [showHouse, setShowHouse] = useState(false);
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [showUpperAdmin, setShowUpperAdmin] = useState(() => {
    const saved = sessionStorage.getItem('upperAdminMode');
    return saved === 'true';
  });
  const [showCodePrompt, setShowCodePrompt] = useState(false);
  const [adminCode, setAdminCode] = useState('');
  const [tradesEnabled, setTradesEnabled] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [username, setUsername] = useState('Anonymous');
  const [pendingTrades, setPendingTrades] = useState<TradeRequest[]>([]);
  const [selectedTrade, setSelectedTrade] = useState<TradeRequest | null>(null);
  const [showIncomingNotification, setShowIncomingNotification] = useState(false);
  const [incomingTrade, setIncomingTrade] = useState<TradeRequest | null>(null);
  const [tradeWithUserId, setTradeWithUserId] = useState<string | null>(null);
  const [tradeWithUserName, setTradeWithUserName] = useState<string>('');
  const { totalTimeSeconds } = useTimeTracking(userId || '');

  const isNovember = new Date().getMonth() === 10;
  const isDecember = new Date().getMonth() === 11;

  const highestPetLevel = pets.length > 0
    ? Math.max(...pets.filter(p => isAdminMode || p.user_id === userId).map(p => p.level), 1)
    : 1;

  const totalCoins = pets
    .filter(p => p.user_id === userId)
    .reduce((sum, pet) => sum + pet.coins, 0);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Auth check timeout')), 5000)
        );

        const authPromise = supabase.auth.getSession();

        const { data: { session } } = await Promise.race([authPromise, timeoutPromise]) as any;

        if (session?.user) {
          setUserId(session.user.id);
          setIsAuthenticated(true);
          setUsername(session.user.user_metadata?.username || 'Anonymous');
        }
      } catch (error) {
        console.error('Auth check failed:', error);
      } finally {
        setAuthLoading(false);
      }
    };

    checkAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUserId(session.user.id);
        setIsAuthenticated(true);
        setUsername(session.user.user_metadata?.username || 'Anonymous');
      } else {
        setUserId(null);
        setIsAuthenticated(false);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;

    loadPets();
    updateUserActivity();
    loadOnlineUsers();
    loadTradeSettings();
    ensureUserSettings();
    checkBanStatus();
    checkAdminStatus();
    loadPendingTrades();

    const statsInterval = setInterval(() => {
      degradeStats();
    }, 30000);
    const eventsInterval = setInterval(() => {
      triggerRandomEvents();
    }, 45000);
    const mutationInterval = setInterval(() => {
      checkCrownMutations();
    }, 60000);
    const dragonInterval = setInterval(() => {
      applyDragonBonus();
    }, 300000);
    const activityInterval = setInterval(() => {
      updateUserActivity();
    }, 30000);
    const onlineCheckInterval = setInterval(() => {
      loadOnlineUsers();
    }, 30000);

    const subscription = supabase
      .channel('trade_requests')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'trade_requests',
          filter: `recipient_id=eq.${userId}`
        },
        (payload) => {
          if (payload.eventType === 'INSERT' && payload.new?.status === 'pending') {
            loadPendingTrades();
          }
          if (payload.eventType === 'UPDATE') {
            if (payload.new?.status !== 'pending') {
              loadPendingTrades();
              setShowIncomingNotification(false);
              setIncomingTrade(null);
            } else {
              loadPendingTrades();
            }
          }
          if (payload.eventType === 'DELETE') {
            loadPendingTrades();
            setShowIncomingNotification(false);
            setIncomingTrade(null);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'trade_requests',
          filter: `sender_id=eq.${userId}`
        },
        (payload: any) => {
          if (payload.eventType === 'UPDATE') {
            if (payload.new?.status === 'accepted') {
              setSelectedTrade(payload.new);
            } else if (payload.new?.status !== 'pending') {
              setSelectedTrade(null);
            }
          }
          if (payload.eventType === 'DELETE') {
            setSelectedTrade(null);
          }
        }
      )
      .subscribe();

    return () => {
      clearInterval(statsInterval);
      clearInterval(eventsInterval);
      clearInterval(mutationInterval);
      clearInterval(dragonInterval);
      clearInterval(activityInterval);
      clearInterval(onlineCheckInterval);
      supabase.removeChannel(subscription);

      if (userId) {
        (async () => {
          try {
            await supabase
              .from('user_activity')
              .update({
                is_online: false,
                last_active: new Date().toISOString()
              })
              .eq('user_id', userId);
            console.log('User marked as offline');
          } catch (error) {
            console.error('Error marking user as offline:', error);
          }
        })();
      }
    };
  }, [isAuthenticated, userId, username, selectedTrade?.id]);

  useEffect(() => {
    sessionStorage.setItem('upperAdminMode', String(showUpperAdmin));
  }, [showUpperAdmin]);

  const loadPets = async () => {
    try {
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Request timeout')), 10000)
      );

      const loadPromise = (async () => {
        const { data: allUserPetInventory } = await supabase
          .from('pet_inventory')
          .select('pet_id')
          .eq('user_id', userId);

        setTotalPetCount((allUserPetInventory || []).length);

        const { data: activePetInventory } = await supabase
          .from('pet_inventory')
          .select('pet_id')
          .eq('is_active', true);

        const activePetIds = (activePetInventory || []).map(pi => pi.pet_id);

        if (activePetIds.length > 0) {
          const { data, error } = await supabase
            .from('pets')
            .select('*')
            .in('id', activePetIds)
            .order('created_at', { ascending: false });

          if (error) throw error;
          setPets(data || []);
        } else {
          setPets([]);
        }
      })();

      await Promise.race([loadPromise, timeoutPromise]);
    } catch (error) {
      console.error('Error loading pets:', error);
      setPets([]);
      setTotalPetCount(0);
    } finally {
      setLoading(false);
    }
  };

  const updateUserActivity = async () => {
    if (!userId) return;

    try {
      const { data: existing } = await supabase
        .from('user_activity')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (existing) {
        await supabase
          .from('user_activity')
          .update({
            last_active: new Date().toISOString(),
            is_online: true
          })
          .eq('user_id', userId);
      } else {
        await supabase
          .from('user_activity')
          .insert({
            user_id: userId,
            last_active: new Date().toISOString(),
            is_online: true
          });
      }
    } catch (error) {
      console.error('Error updating user activity:', error);
    }
  };

  const loadOnlineUsers = async () => {
    try {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

      const { data, error } = await supabase
        .from('user_activity')
        .select('user_id')
        .gte('last_active', fiveMinutesAgo);

      if (error) throw error;

      const onlineIds = new Set(data?.map(u => u.user_id) || []);
      setOnlineUserIds(onlineIds);
    } catch (error) {
      console.error('Error loading online users:', error);
    }
  };

  const loadTradeSettings = async () => {
    if (!userId) return;

    try {
      const { data } = await supabase
        .from('user_settings')
        .select('trades_enabled')
        .eq('user_id', userId)
        .maybeSingle();

      setTradesEnabled(data?.trades_enabled || false);
      await loadPendingTrades();
    } catch (error) {
      console.error('Error loading trade settings:', error);
    }
  };

  const loadPendingTrades = async () => {
    if (!userId) return;

    try {
      const { data: receivedTrades } = await supabase
        .from('trade_requests')
        .select('*')
        .eq('recipient_id', userId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      const { data: sentTrades } = await supabase
        .from('trade_requests')
        .select('*')
        .eq('sender_id', userId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      const allTrades = [
        ...(receivedTrades || []),
        ...(sentTrades || [])
      ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      setPendingTrades(allTrades);

      if (receivedTrades && receivedTrades.length > 0) {
        const newTrade = receivedTrades[0];
        if (!incomingTrade || incomingTrade.id !== newTrade.id) {
          setIncomingTrade(newTrade);
          setShowIncomingNotification(true);
        }
      } else {
        setIncomingTrade(null);
        setShowIncomingNotification(false);
      }
    } catch (error) {
      console.error('Error loading pending trades:', error);
    }
  };

  const checkAdminStatus = async () => {
    if (!userId) return;

    try {
      const { data } = await supabase
        .from('admin_users')
        .select('is_super_admin')
        .eq('user_id', userId)
        .maybeSingle();

      if (data) {
        setIsSuperAdmin(data.is_super_admin);
      }
    } catch (error) {
      console.error('Error checking admin status:', error);
    }
  };

  const checkBanStatus = async () => {
    if (!userId) return;

    try {
      const { data } = await supabase
        .from('banned_users')
        .select('is_active')
        .eq('user_id', userId)
        .eq('is_active', true)
        .maybeSingle();

      if (data) {
        await supabase.auth.signOut();
        alert('Your account has been banned. Please contact an administrator.');
      }
    } catch (error) {
      console.error('Error checking ban status:', error);
    }
  };

  const ensureUserSettings = async () => {
    if (!userId || !username) return;

    try {
      const { data: existing } = await supabase
        .from('user_settings')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (existing) {
        if (existing.username !== username) {
          await supabase
            .from('user_settings')
            .update({ username, updated_at: new Date().toISOString() })
            .eq('user_id', userId);
        }
      } else {
        await supabase
          .from('user_settings')
          .insert({
            user_id: userId,
            username,
            trades_enabled: false
          });
      }
    } catch (error) {
      console.error('Error ensuring user settings:', error);
    }
  };

  const toggleTradeSettings = async () => {
    if (!userId) return;

    const newValue = !tradesEnabled;

    try {
      const { data: existing } = await supabase
        .from('user_settings')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (existing) {
        await supabase
          .from('user_settings')
          .update({
            trades_enabled: newValue,
            updated_at: new Date().toISOString()
          })
          .eq('user_id', userId);
      } else {
        await supabase
          .from('user_settings')
          .insert({
            user_id: userId,
            trades_enabled: newValue
          });
      }

      setTradesEnabled(newValue);
      showMessage(newValue ? 'Trading enabled!' : 'Trading disabled');
    } catch (error) {
      console.error('Error updating trade settings:', error);
      showMessage('Failed to update trade settings');
    }
  };

  const degradeStats = async () => {
    try {
      const { data: activePetInventory } = await supabase
        .from('pet_inventory')
        .select('pet_id')
        .eq('user_id', userId)
        .eq('is_active', true);

      if (!activePetInventory || activePetInventory.length === 0) return;

      const activePetIds = activePetInventory.map(pi => pi.pet_id);

      const { data: currentPets } = await supabase
        .from('pets')
        .select('*')
        .in('id', activePetIds)
        .eq('user_id', userId);

      if (!currentPets) return;

      for (const pet of currentPets) {
        const now = new Date();
        const lastFed = new Date(pet.last_fed);
        const lastPlayed = new Date(pet.last_played);
        const lastCleaned = new Date(pet.last_cleaned);

        const minutesSinceFed = (now.getTime() - lastFed.getTime()) / 60000;
        const minutesSincePlayed = (now.getTime() - lastPlayed.getTime()) / 60000;
        const minutesSinceCleaned = (now.getTime() - lastCleaned.getTime()) / 60000;

        if (pet.is_sleeping && pet.sleep_ends_at) {
          const sleepEndsAt = new Date(pet.sleep_ends_at);

          if (now >= sleepEndsAt) {
            await supabase
              .from('pets')
              .update({
                is_sleeping: false,
                sleep_started_at: null,
                sleep_ends_at: null,
                energy: 100,
                updated_at: now.toISOString()
              })
              .eq('id', pet.id);

            showMessage(`${pet.name} woke up feeling refreshed!`);
            continue;
          } else {
            const sleepStartedAt = new Date(pet.sleep_started_at!);
            const minutesSlept = (now.getTime() - sleepStartedAt.getTime()) / 60000;
            const energyGained = Math.floor(minutesSlept * 3);
            const newEnergy = Math.min(100, pet.energy + energyGained);

            if (newEnergy !== pet.energy) {
              await supabase
                .from('pets')
                .update({
                  energy: newEnergy,
                  updated_at: now.toISOString()
                })
                .eq('id', pet.id);
            }
            continue;
          }
        }

        if (pet.current_event === 'overfed' && pet.event_started_at) {
          const eventStarted = new Date(pet.event_started_at);
          const minutesSinceEvent = (now.getTime() - eventStarted.getTime()) / 60000;

          if (minutesSinceEvent >= 5) {
            await supabase
              .from('pets')
              .update({
                current_event: null,
                event_started_at: null,
                updated_at: now.toISOString()
              })
              .eq('id', pet.id);

            showMessage(`${pet.name} is feeling better now!`);
            continue;
          }
        }

        const newHunger = Math.max(0, pet.hunger - Math.floor(minutesSinceFed / 2));
        const newHappiness = Math.max(0, pet.happiness - Math.floor(minutesSincePlayed / 3));
        const newCleanliness = Math.max(0, pet.cleanliness - Math.floor(minutesSinceCleaned / 4));
        const newThirst = Math.max(0, pet.thirst - Math.floor(minutesSinceFed / 1.5));

        if (newHunger === 0 || newHappiness === 0 || newCleanliness === 0 || pet.energy === 0 || newThirst === 0) {
          await supabase
            .from('pets')
            .delete()
            .eq('id', pet.id);

          showMessage(`${pet.name} ran away because their needs weren't met... 💔`);
        } else if (newHunger !== pet.hunger || newHappiness !== pet.happiness || newCleanliness !== pet.cleanliness || newThirst !== pet.thirst) {
          await supabase
            .from('pets')
            .update({
              hunger: newHunger,
              happiness: newHappiness,
              cleanliness: newCleanliness,
              thirst: newThirst,
              updated_at: now.toISOString()
            })
            .eq('id', pet.id);
        }
      }

      await loadPets();
    } catch (error) {
      console.error('Error degrading stats:', error);
    }
  };

  const checkCrownMutations = async () => {
    try {
      const { data: activePetInventory } = await supabase
        .from('pet_inventory')
        .select('pet_id')
        .eq('user_id', userId)
        .eq('is_active', true);

      if (!activePetInventory || activePetInventory.length === 0) return;

      const activePetIds = activePetInventory.map(pi => pi.pet_id);

      const { data: currentPets } = await supabase
        .from('pets')
        .select('*')
        .in('id', activePetIds)
        .eq('user_id', userId);

      if (!currentPets) return;

      for (const pet of currentPets) {
        if (pet.accessories.hat !== '👑') continue;

        const now = new Date();
        const lastCheck = new Date(pet.last_mutation_check);
        const minutesSinceCheck = (now.getTime() - lastCheck.getTime()) / 60000;

        if (minutesSinceCheck >= 20) {
          if (Math.random() < 0.4) {
            const mutationTypes = ['cat', 'dog', 'fox', 'bird', 'rabbit', 'bear', 'panda', 'koala', 'hamster', 'mouse', 'pig', 'frog', 'monkey', 'lion', 'tiger', 'cow', 'turkey', 'shark', 'crocodile', 'flamingo', 'duck', 'turtle', 'butterfly', 'elephant', 'giraffe', 'dinosaur', 'crab', 'lobster', 'shrimp', 'squid', 'octopus', 'pufferfish', 'eagle', 'owl', 'bat', 'bee', 'unicorn', 'boar', 'dolphin', 'whale', 'leopard', 'swan', 'parrot', 'badger', 'rat', 'squirrel', 'hedgehog', 'rhino', 'waterbuffalo', 'kangaroo', 'camel', 'dromedary', 'ox', 'horse', 'ram', 'deer', 'goat', 'sheep'] as const;
            const newType = mutationTypes[Math.floor(Math.random() * mutationTypes.length)];

            await supabase
              .from('pets')
              .update({
                type: newType,
                last_mutation_check: now.toISOString(),
                updated_at: now.toISOString()
              })
              .eq('id', pet.id);

            showMessage(`👑 ${pet.name} magically transformed into a ${newType}! ✨`);
          } else {
            await supabase
              .from('pets')
              .update({
                last_mutation_check: now.toISOString(),
                updated_at: now.toISOString()
              })
              .eq('id', pet.id);
          }
        }
      }

      await loadPets();
    } catch (error) {
      console.error('Error checking crown mutations:', error);
    }
  };

  const triggerRandomEvents = async () => {
    try {
      const { data: activePetInventory } = await supabase
        .from('pet_inventory')
        .select('pet_id')
        .eq('user_id', userId)
        .eq('is_active', true);

      if (!activePetInventory || activePetInventory.length === 0) return;

      const activePetIds = activePetInventory.map(pi => pi.pet_id);

      const { data: currentPets } = await supabase
        .from('pets')
        .select('*')
        .in('id', activePetIds)
        .eq('user_id', userId);

      if (!currentPets) return;

      for (const pet of currentPets) {
        if (pet.current_event) continue;

        if (Math.random() < 0.3) {
          const eventTypes = Object.keys(PET_EVENTS) as PetEventType[];
          const randomEvent = eventTypes[Math.floor(Math.random() * eventTypes.length)];
          const event = PET_EVENTS[randomEvent];

          const updates: any = {
            current_event: randomEvent,
            event_started_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };

          if (event.effects.hunger) updates.hunger = Math.max(0, pet.hunger + event.effects.hunger);
          if (event.effects.happiness) updates.happiness = Math.max(0, pet.happiness + event.effects.happiness);
          if (event.effects.cleanliness) updates.cleanliness = Math.max(0, pet.cleanliness + event.effects.cleanliness);
          if (event.effects.energy) updates.energy = Math.max(0, pet.energy + event.effects.energy);
          if (event.effects.thirst) updates.thirst = Math.max(0, pet.thirst + event.effects.thirst);

          await supabase
            .from('pets')
            .update(updates)
            .eq('id', pet.id);

          showMessage(`${pet.name} is ${event.title}! ${event.emoji}`);
        }
      }

      await loadPets();
    } catch (error) {
      console.error('Error triggering events:', error);
    }
  };

  const applyDragonBonus = async () => {
    try {
      const { data: activePetInventory } = await supabase
        .from('pet_inventory')
        .select('pet_id')
        .eq('user_id', userId)
        .eq('is_active', true);

      if (!activePetInventory || activePetInventory.length === 0) return;

      const activePetIds = activePetInventory.map(pi => pi.pet_id);
      const userPets = pets.filter(p => activePetIds.includes(p.id) && p.user_id === userId);
      const hasDragon = userPets.some(p => p.type === 'dragon');

      if (!hasDragon) return;

      for (const pet of userPets) {
        if (pet.type !== 'dragon') {
          const newXp = pet.xp + 50;
          const newLevel = Math.floor(newXp / 100) + 1;

          await supabase
            .from('pets')
            .update({
              xp: newXp,
              level: newLevel
            })
            .eq('id', pet.id);
        }
      }

      await loadPets();
      showMessage('🐉 Dragon power activated! All pets gained +50 XP!');
    } catch (error) {
      console.error('Error applying dragon bonus:', error);
    }
  };

  const showMessage = (message: string) => {
    setActionMessage(message);
    setTimeout(() => setActionMessage(''), 3000);
  };

  const adoptPet = async (name: string, type: 'cat' | 'dog' | 'fox' | 'bird' | 'rabbit' | 'bear' | 'panda' | 'koala' | 'hamster' | 'mouse' | 'pig' | 'frog' | 'monkey' | 'lion' | 'tiger' | 'cow' | 'turkey' | 'dragon' | 'shark' | 'seal' | 'crocodile' | 'flamingo' | 'duck' | 'turtle' | 'butterfly' | 'elephant' | 'giraffe' | 'dinosaur' | 'crab' | 'lobster' | 'shrimp' | 'squid' | 'octopus' | 'pufferfish' | 'eagle' | 'owl' | 'bat' | 'bee' | 'unicorn' | 'boar' | 'dolphin' | 'whale' | 'leopard' | 'swan' | 'parrot' | 'badger' | 'rat' | 'squirrel' | 'hedgehog' | 'rhino' | 'waterbuffalo' | 'kangaroo' | 'camel' | 'dromedary' | 'ox' | 'horse' | 'ram' | 'deer' | 'goat' | 'sheep', ownerName: string, breed?: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const username = user?.user_metadata?.username || user?.email?.split('@')[0] || 'Anonymous';

      const { data: existingSettings } = await supabase
        .from('user_settings')
        .select('display_name')
        .eq('user_id', userId)
        .maybeSingle();

      if (!existingSettings?.display_name) {
        const { data: settingsData } = await supabase
          .from('user_settings')
          .select('*')
          .eq('user_id', userId)
          .maybeSingle();

        if (settingsData) {
          await supabase
            .from('user_settings')
            .update({ display_name: username })
            .eq('user_id', userId);
        } else {
          await supabase
            .from('user_settings')
            .insert({ user_id: userId, display_name: username, trades_enabled: false });
        }
      }

      const petLevelRequirements: Record<string, number> = {
        cat: 1, dog: 1, bird: 5, hamster: 5, rabbit: 5,
        duck: 8, butterfly: 8, bee: 8,
        mouse: 10, pig: 10, frog: 10,
        rat: 12, squirrel: 12, hedgehog: 12,
        fox: 15, bear: 15, turtle: 15,
        owl: 18, bat: 18, parrot: 18,
        panda: 20, koala: 20, badger: 20,
        deer: 22, goat: 22, sheep: 22,
        monkey: 25, boar: 25,
        kangaroo: 28, horse: 28,
        lion: 30, tiger: 30, leopard: 30,
        crocodile: 32, eagle: 32,
        cow: 35, turkey: 35, ox: 35, ram: 35,
        camel: 38, dromedary: 38,
        flamingo: 40, shark: 40, seal: 40, dolphin: 40,
        swan: 42,
        pufferfish: 45, octopus: 45, squid: 45,
        crab: 48, lobster: 48, shrimp: 48,
        elephant: 50, giraffe: 50,
        rhino: 55, waterbuffalo: 55,
        whale: 60,
        dinosaur: 70,
        unicorn: 80,
        dragon: 100
      };

      const requiredLevel = petLevelRequirements[type] || 1;
      const baseAdoptionCost = requiredLevel === 1 ? 0 : requiredLevel * 100;
      const adoptionCost = isAdminMode ? 0 : baseAdoptionCost;

      const { data: userPets } = await supabase
        .from('pets')
        .select('*')
        .eq('user_id', userId)
        .order('coins', { ascending: false });

      if (adoptionCost > 0) {
        const currentTotalCoins = userPets?.reduce((sum, pet) => sum + pet.coins, 0) || 0;

        if (currentTotalCoins < adoptionCost) {
          showMessage(`Not enough coins! You need ${adoptionCost} coins to adopt this pet.`);
          return;
        }

        let remainingCost = adoptionCost;
        for (const pet of userPets || []) {
          if (remainingCost <= 0) break;

          const deduction = Math.min(pet.coins, remainingCost);
          await supabase
            .from('pets')
            .update({ coins: pet.coins - deduction })
            .eq('id', pet.id);

          remainingCost -= deduction;
        }
      }

      const finalOwnerName = ownerName || null;

      if (finalOwnerName) {
        const existingOwnerName = userPets && userPets.length > 0 ? userPets[0].owner_name : null;

        if (!existingOwnerName || existingOwnerName !== finalOwnerName) {
          const { data: existingOwner } = await supabase
            .from('pets')
            .select('owner_name')
            .eq('owner_name', finalOwnerName)
            .maybeSingle();

          if (existingOwner) {
            showMessage(`The nickname "${finalOwnerName}" is already taken. Please choose a different nickname.`);
            return;
          }
        }

        await supabase
          .from('user_settings')
          .update({ display_name: finalOwnerName })
          .eq('user_id', userId);
      }

      const { data: newPet, error: petError } = await supabase
        .from('pets')
        .insert({
          name,
          type,
          breed: breed || null,
          owner_name: finalOwnerName,
          user_id: userId,
          hunger: 80,
          happiness: 80,
          cleanliness: 80,
          energy: 80,
          thirst: 80
        })
        .select()
        .single();

      if (petError) throw petError;

      const { error: inventoryError } = await supabase
        .from('pet_inventory')
        .insert({
          user_id: userId,
          pet_id: newPet.id,
          is_active: false
        });

      if (inventoryError) throw inventoryError;

      await loadPets();
      setShowAdoptModal(false);
      soundManager.play('adopt');
      if (isAdminMode && baseAdoptionCost > 0) {
        showMessage(`${name} has been added to your pet inventory for FREE! (Admin Mode) 🎉`);
      } else {
        showMessage(`${name} has been added to your pet inventory! 🎉`);
      }
    } catch (error) {
      console.error('Error adopting pet:', error);
      showMessage('Failed to adopt pet');
    }
  };

  const handleActivatePet = async (petId: string) => {
    try {
      await supabase
        .from('pet_inventory')
        .update({ is_active: false })
        .eq('user_id', userId);

      await supabase
        .from('pet_inventory')
        .update({ is_active: true })
        .eq('pet_id', petId)
        .eq('user_id', userId);

      await loadPets();
      showMessage('Pet equipped!');
    } catch (error) {
      console.error('Error activating pet:', error);
      showMessage('Failed to activate pet');
    }
  };

  const handleDeactivatePet = async (petId: string) => {
    try {
      await supabase
        .from('pet_inventory')
        .update({ is_active: false })
        .eq('pet_id', petId)
        .eq('user_id', userId);

      await loadPets();
      showMessage('Pet stored in inventory!');
    } catch (error) {
      console.error('Error deactivating pet:', error);
      showMessage('Failed to store pet');
    }
  };

  const handleApplyAccessory = async (
    petId: string,
    accessoryType: 'hat' | 'toy' | 'eyewear',
    emoji: string,
    inventoryId: string
  ) => {
    try {
      const pet = pets.find(p => p.id === petId);
      if (!pet) return;

      if (pet.accessories[accessoryType]) {
        showMessage(`Remove the current ${accessoryType} before applying a new one`);
        return;
      }

      const newAccessories = { ...pet.accessories };
      newAccessories[accessoryType] = emoji;

      await supabase
        .from('pets')
        .update({
          accessories: newAccessories,
          updated_at: new Date().toISOString()
        })
        .eq('id', petId);

      const { data: inventoryItem } = await supabase
        .from('accessory_inventory')
        .select('quantity')
        .eq('id', inventoryId)
        .maybeSingle();

      if (inventoryItem) {
        if (inventoryItem.quantity > 1) {
          await supabase
            .from('accessory_inventory')
            .update({ quantity: inventoryItem.quantity - 1 })
            .eq('id', inventoryId);
        } else {
          await supabase
            .from('accessory_inventory')
            .delete()
            .eq('id', inventoryId);
        }
      }

      await loadPets();
      showMessage(`Accessory applied to ${pet.name}!`);
    } catch (error) {
      console.error('Error applying accessory:', error);
      showMessage('Failed to apply accessory');
    }
  };

  const handlePlaceHouseItem = async (item: HouseInventoryItem, room: 'lower' | 'upper') => {
    try {
      await supabase
        .from('house_inventory')
        .update({
          placed: true,
          room: room
        })
        .eq('id', item.id);

      showMessage(`${item.item_name} placed in ${room} floor!`);
    } catch (error) {
      console.error('Error placing item:', error);
      showMessage('Failed to place item');
    }
  };

  const handleUnequipAccessory = async (petId: string, accessoryType: 'hat' | 'toy' | 'eyewear') => {
    try {
      const pet = pets.find(p => p.id === petId);
      if (!pet) return;

      const itemEmoji = pet.accessories[accessoryType];
      if (!itemEmoji) return;

      const newAccessories = { ...pet.accessories };
      newAccessories[accessoryType] = null;

      await supabase
        .from('pets')
        .update({
          accessories: newAccessories,
          updated_at: new Date().toISOString()
        })
        .eq('id', petId);

      const shopItemQuery = await supabase
        .from('shop_items')
        .select('*')
        .eq('emoji', itemEmoji)
        .eq('type', accessoryType)
        .maybeSingle();

      if (shopItemQuery.data) {
        const shopItem = shopItemQuery.data;
        const { data: existingItem } = await supabase
          .from('accessory_inventory')
          .select('*')
          .eq('user_id', pet.user_id)
          .eq('item_id', shopItem.id)
          .maybeSingle();

        if (existingItem) {
          await supabase
            .from('accessory_inventory')
            .update({
              quantity: existingItem.quantity + 1
            })
            .eq('id', existingItem.id);
        } else {
          await supabase
            .from('accessory_inventory')
            .insert({
              user_id: pet.user_id,
              item_id: shopItem.id,
              item_name: shopItem.name,
              item_type: shopItem.type,
              item_emoji: shopItem.emoji,
              quantity: 1
            });
        }
      }

      await loadPets();
      showMessage(`${accessoryType} unequipped and returned to inventory!`);
    } catch (error) {
      console.error('Error unequipping accessory:', error);
      showMessage('Failed to unequip accessory');
    }
  };

  const calculateXPNeeded = (level: number) => {
    return Math.floor(100 * Math.pow(1.5, level - 1));
  };

  const addXP = (pet: Pet, amount: number) => {
    const newXP = pet.xp + amount;
    const xpNeeded = calculateXPNeeded(pet.level);

    if (newXP >= xpNeeded) {
      const newLevel = pet.level + 1;
      const bonusCoins = newLevel * 20;
      soundManager.play('levelup');
      soundManager.play('coin');
      showMessage(`🎉 ${pet.name} leveled up to ${newLevel}! +${bonusCoins} coins!`);
      return {
        xp: newXP - xpNeeded,
        level: newLevel,
        coins: pet.coins + amount + bonusCoins
      };
    }

    soundManager.play('coin');
    return {
      xp: newXP,
      level: pet.level,
      coins: pet.coins + amount
    };
  };

  const checkPetRunaway = async (petId: string, petName: string, hunger: number, happiness: number, cleanliness: number, energy: number, thirst: number) => {
    if (hunger === 0 || happiness === 0 || cleanliness === 0 || energy === 0 || thirst === 0) {
      await supabase
        .from('pets')
        .delete()
        .eq('id', petId);

      showMessage(`${petName} ran away because their needs weren't met... 💔`);
      await loadPets();
      return true;
    }
    return false;
  };

  const feedPet = async (pet: Pet) => {
    try {
      if (pet.is_sleeping) {
        soundManager.play('error');
        showMessage(`${pet.name} is sleeping! Don't disturb them.`);
        return;
      }

      if (pet.current_event === 'overfed') {
        soundManager.play('error');
        showMessage(`${pet.name} is sick from overeating. Wait 5 minutes!`);
        return;
      }

      if (pet.hunger >= 100) {
        soundManager.play('error');
        await supabase
          .from('pets')
          .update({
            current_event: 'overfed',
            event_started_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('id', pet.id);

        showMessage(`${pet.name} is overfed and feels sick! 🤢 Wait 5 minutes...`);
        await loadPets();
        return;
      }

      soundManager.play('feed');

      const newHunger = Math.min(100, pet.hunger + 25);
      const newEnergy = Math.min(100, pet.energy + 10);
      const baseXP = 10 * pet.level;
      const xpGain = addXP(pet, baseXP);

      const updates: any = {
        hunger: newHunger,
        energy: newEnergy,
        xp: xpGain.xp,
        level: xpGain.level,
        coins: xpGain.coins,
        last_fed: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      if (pet.current_event && (pet.current_event === 'extra_hungry' || pet.current_event === 'sick' || pet.current_event === 'injured')) {
        updates.current_event = null;
        updates.event_started_at = null;
        showMessage(`${pet.name} is feeling much better! 🍖✨`);
      } else {
        showMessage(`${pet.name} enjoyed the meal! +${baseXP} XP`);
      }

      await supabase
        .from('pets')
        .update(updates)
        .eq('id', pet.id);

      await loadPets();
    } catch (error) {
      console.error('Error feeding pet:', error);
    }
  };

  const playWithPet = async (pet: Pet) => {
    try {
      if (pet.is_sleeping) {
        soundManager.play('error');
        showMessage(`${pet.name} is sleeping! Don't disturb them.`);
        return;
      }

      if (pet.current_event === 'overfed') {
        soundManager.play('error');
        showMessage(`${pet.name} is too sick to play right now!`);
        return;
      }

      soundManager.play('play');

      const newHappiness = Math.min(100, pet.happiness + 25);
      const newEnergy = Math.max(0, pet.energy - 15);

      if (await checkPetRunaway(pet.id, pet.name, pet.hunger, newHappiness, pet.cleanliness, newEnergy, pet.thirst)) {
        return;
      }

      const baseXP = 15 * pet.level;
      const xpGain = addXP(pet, baseXP);

      const updates: any = {
        happiness: newHappiness,
        energy: newEnergy,
        xp: xpGain.xp,
        level: xpGain.level,
        coins: xpGain.coins,
        last_played: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      if (pet.current_event && (pet.current_event === 'depressed' || pet.current_event === 'anxious')) {
        updates.current_event = null;
        updates.event_started_at = null;
        showMessage(`${pet.name} is happy again! 🎾✨`);
      } else {
        showMessage(`${pet.name} had fun playing! +${baseXP} XP`);
      }

      await supabase
        .from('pets')
        .update(updates)
        .eq('id', pet.id);

      await loadPets();
    } catch (error) {
      console.error('Error playing with pet:', error);
    }
  };

  const cleanPet = async (pet: Pet) => {
    try {
      if (pet.is_sleeping) {
        soundManager.play('error');
        showMessage(`${pet.name} is sleeping! Don't disturb them.`);
        return;
      }

      if (pet.current_event === 'overfed') {
        soundManager.play('error');
        showMessage(`${pet.name} is too sick to be cleaned right now!`);
        return;
      }

      soundManager.play('clean');

      const newCleanliness = Math.min(100, pet.cleanliness + 30);
      const baseXP = 12 * pet.level;
      const xpGain = addXP(pet, baseXP);

      const updates: any = {
        cleanliness: newCleanliness,
        xp: xpGain.xp,
        level: xpGain.level,
        coins: xpGain.coins,
        last_cleaned: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      if (pet.current_event && (pet.current_event === 'sick' || pet.current_event === 'anxious')) {
        updates.current_event = null;
        updates.event_started_at = null;
        showMessage(`${pet.name} is feeling better! 🛁✨`);
      } else {
        showMessage(`${pet.name} is sparkling clean! +${baseXP} XP`);
      }

      await supabase
        .from('pets')
        .update(updates)
        .eq('id', pet.id);

      await loadPets();
    } catch (error) {
      console.error('Error cleaning pet:', error);
    }
  };

  const giveWater = async (pet: Pet) => {
    try {
      if (pet.is_sleeping) {
        soundManager.play('error');
        showMessage(`${pet.name} is sleeping! Don't disturb them.`);
        return;
      }

      if (pet.current_event === 'overfed') {
        soundManager.play('error');
        showMessage(`${pet.name} is too sick to drink right now!`);
        return;
      }

      soundManager.play('water');

      const newThirst = Math.min(100, pet.thirst + 30);
      const baseXP = 8 * pet.level;
      const xpGain = addXP(pet, baseXP);

      const updates: any = {
        thirst: newThirst,
        xp: xpGain.xp,
        level: xpGain.level,
        coins: xpGain.coins,
        updated_at: new Date().toISOString()
      };

      if (pet.current_event === 'thirsty') {
        updates.current_event = null;
        updates.event_started_at = null;
        showMessage(`${pet.name} is hydrated again! 💧✨`);
      } else {
        showMessage(`${pet.name} enjoyed the water! +${baseXP} XP`);
      }

      await supabase
        .from('pets')
        .update(updates)
        .eq('id', pet.id);

      await loadPets();
    } catch (error) {
      console.error('Error giving water:', error);
    }
  };

  const playWithToy = async (pet: Pet) => {
    try {
      if (pet.current_event === 'overfed') {
        soundManager.play('error');
        showMessage(`${pet.name} is too sick to play with toys right now!`);
        return;
      }

      if (!pet.accessories.toy) {
        soundManager.play('error');
        showMessage(`${pet.name} doesn't have a toy yet!`);
        return;
      }

      soundManager.play('play');

      if (pet.accessories.toy === '😴') {
        if (pet.is_sleeping) {
          showMessage(`${pet.name} is already sleeping!`);
          return;
        }

        const now = new Date();
        const sleepEndsAt = new Date(now.getTime() + 10 * 60 * 1000);

        await supabase
          .from('pets')
          .update({
            is_sleeping: true,
            sleep_started_at: now.toISOString(),
            sleep_ends_at: sleepEndsAt.toISOString(),
            updated_at: now.toISOString()
          })
          .eq('id', pet.id);

        showMessage(`${pet.name} put on the sleep mask and fell asleep for 10 minutes! 💤`);
        await loadPets();
        return;
      }

      const now = new Date();
      const lastPlayedDate = new Date(pet.last_toy_played);
      const isNewDay = now.getDate() !== lastPlayedDate.getDate() ||
                       now.getMonth() !== lastPlayedDate.getMonth() ||
                       now.getFullYear() !== lastPlayedDate.getFullYear();

      const currentCount = isNewDay ? 0 : pet.toy_play_count;

      if (currentCount >= 5) {
        showMessage(`${pet.name} is tired of playing with toys today. Try again tomorrow!`);
        return;
      }

      const newHappiness = Math.min(100, pet.happiness + 20);

      if (await checkPetRunaway(pet.id, pet.name, pet.hunger, newHappiness, pet.cleanliness, pet.energy, pet.thirst)) {
        return;
      }

      const baseXP = 12 * pet.level;
      const xpGain = addXP(pet, baseXP);

      await supabase
        .from('pets')
        .update({
          happiness: newHappiness,
          xp: xpGain.xp,
          level: xpGain.level,
          coins: xpGain.coins,
          toy_play_count: currentCount + 1,
          last_toy_played: now.toISOString(),
          updated_at: now.toISOString()
        })
        .eq('id', pet.id);

      const remaining = 5 - (currentCount + 1);
      showMessage(`${pet.name} had fun with their toy! +${baseXP} XP (${remaining} plays left today)`);
      await loadPets();
    } catch (error) {
      console.error('Error playing with toy:', error);
    }
  };

  const startActivity = async (pet: Pet, activityType: ActivityType) => {
    if (pet.current_event === 'overfed') {
      soundManager.play('error');
      showMessage(`${pet.name} is too sick for activities right now!`);
      return;
    }

    const activity = ACTIVITIES[activityType];

    if (pet.coins < activity.cost) {
      soundManager.play('error');
      showMessage('Not enough coins!');
      return;
    }

    soundManager.play('success');

    try {
      const xpGain = addXP(pet, activity.xpReward);
      const cooldownKey = `last_${activityType}` as keyof Pet;

      const updates: any = {
        coins: xpGain.coins + activity.coinReward - activity.cost,
        xp: xpGain.xp,
        level: xpGain.level,
        [cooldownKey]: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const newHunger = activity.effects.hunger ? Math.min(100, Math.max(0, pet.hunger + activity.effects.hunger)) : pet.hunger;
      const newHappiness = activity.effects.happiness ? Math.min(100, Math.max(0, pet.happiness + activity.effects.happiness)) : pet.happiness;
      const newCleanliness = activity.effects.cleanliness ? Math.min(100, Math.max(0, pet.cleanliness + activity.effects.cleanliness)) : pet.cleanliness;
      const newEnergy = activity.effects.energy ? Math.min(100, Math.max(0, pet.energy + activity.effects.energy)) : pet.energy;
      const newThirst = activity.effects.thirst ? Math.min(100, Math.max(0, pet.thirst + activity.effects.thirst)) : pet.thirst;

      if (await checkPetRunaway(pet.id, pet.name, newHunger, newHappiness, newCleanliness, newEnergy, newThirst)) {
        setSelectedPetForActivities(null);
        return;
      }

      if (activity.effects.hunger) {
        updates.hunger = newHunger;
      }
      if (activity.effects.happiness) {
        updates.happiness = newHappiness;
      }
      if (activity.effects.cleanliness) {
        updates.cleanliness = newCleanliness;
      }
      if (activity.effects.energy) {
        updates.energy = newEnergy;
      }
      if (activity.effects.thirst) {
        updates.thirst = newThirst;
      }

      await supabase
        .from('pets')
        .update(updates)
        .eq('id', pet.id);

      await loadPets();
      setSelectedPetForActivities(null);
      showMessage(`${pet.name} enjoyed ${activity.name}! +${activity.xpReward} XP, +${activity.coinReward} coins!`);
    } catch (error) {
      console.error('Error starting activity:', error);
    }
  };

  const deletePet = async (pet: Pet) => {
    if (!confirm(`Are you sure you want to release ${pet.name}?`)) return;

    try {
      await supabase
        .from('pets')
        .delete()
        .eq('id', pet.id);

      await loadPets();
      showMessage(`${pet.name} was released into the wild`);
    } catch (error) {
      console.error('Error deleting pet:', error);
      showMessage('Failed to release pet');
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-cyan-50 to-teal-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4 animate-bounce">🐾</div>
          <p className="text-xl text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <AuthScreen onAuthenticated={() => setIsAuthenticated(true)} />;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-cyan-50 to-teal-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4 animate-bounce">🐾</div>
          <p className="text-xl text-gray-600">Loading your pets...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen relative ${isNovember ? 'bg-gradient-to-br from-orange-700 via-orange-600 to-amber-600' : isDecember ? 'bg-gradient-to-br from-blue-900 via-indigo-800 to-purple-900' : 'bg-gradient-to-br from-blue-50 via-cyan-50 to-teal-50'}`}>
      {isDecember && <ChristmasDecorations />}
      {isDecember && <AnimatedSleigh />}
      {isNovember && (
        <>
          <div className="fixed left-0 top-0 bottom-0 w-24 bg-gradient-to-r from-amber-900/40 to-transparent pointer-events-none z-10 border-r-4 border-amber-800/30">
            <div className="absolute inset-0 bg-repeat-y opacity-30" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg width='100' height='100' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M10,50 Q30,20 50,50 T90,50' stroke='%23d97706' fill='none' stroke-width='2'/%3E%3C/svg%3E")`, backgroundSize: '50px 50px' }}></div>
          </div>
          <div className="fixed right-0 top-0 bottom-0 w-24 bg-gradient-to-l from-amber-900/40 to-transparent pointer-events-none z-10 border-l-4 border-amber-800/30">
            <div className="absolute inset-0 bg-repeat-y opacity-30" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg width='100' height='100' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M10,50 Q30,20 50,50 T90,50' stroke='%23d97706' fill='none' stroke-width='2'/%3E%3C/svg%3E")`, backgroundSize: '50px 50px' }}></div>
          </div>
        </>
      )}
      <FloatingMusicNotes />
      <div className={`fixed top-4 left-4 bg-white/90 backdrop-blur-sm rounded-xl shadow-lg px-5 py-3 z-20 ${isNovember ? 'border-2 border-amber-300' : isDecember ? 'border-2 border-red-300' : 'border-2 border-cyan-200'}`}>
        <div className="text-sm text-gray-500 font-medium">Today</div>
        <div className="text-lg font-bold text-gray-800">
          {new Date().toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'short',
            day: 'numeric',
            year: 'numeric'
          })}
        </div>
        <div className="mt-2 pt-2 border-t border-gray-200">
          <div className="text-xs text-gray-500 font-medium">Time on site</div>
          <div className={`text-sm font-bold ${isNovember ? 'text-amber-600' : isDecember ? 'text-red-600' : 'text-cyan-600'}`}>
            {formatTimeSpent(totalTimeSeconds)}
          </div>
        </div>
      </div>
      <div className="fixed top-4 right-4 flex flex-col gap-2 z-20">
        {isAdminMode && (
          <div className="bg-red-500/90 backdrop-blur-sm rounded-xl shadow-lg px-4 py-2 border-2 border-red-700 flex items-center justify-between gap-3">
            <div className="text-sm font-bold text-white">ADMIN MODE</div>
            <button
              onClick={() => setShowCodePrompt(true)}
              className="p-1 hover:bg-red-600 rounded transition-colors"
              title="Upper Admin Panel"
            >
              <ShieldAlert size={14} className="text-white" />
            </button>
          </div>
        )}
        <button
          onClick={toggleTradeSettings}
          className={`bg-white/90 backdrop-blur-sm rounded-xl shadow-lg px-4 py-2 ${isNovember ? 'border-2 border-amber-300' : isDecember ? 'border-2 border-red-300' : 'border-2 border-cyan-200'} hover:bg-gray-100 transition-colors`}
        >
          <div className="flex items-center gap-2">
            <div className={`w-10 h-5 rounded-full transition-colors ${tradesEnabled ? 'bg-green-500' : 'bg-gray-300'} relative`}>
              <div className={`w-4 h-4 bg-white rounded-full absolute top-0.5 transition-transform ${tradesEnabled ? 'translate-x-5' : 'translate-x-0.5'}`}></div>
            </div>
            <div className="text-sm font-semibold text-gray-700">Trading {tradesEnabled ? 'On' : 'Off'}</div>
          </div>
        </button>
        <button
          onClick={() => setShowProfile(true)}
          className={`bg-white/90 backdrop-blur-sm rounded-xl shadow-lg px-4 py-2 ${isNovember ? 'border-2 border-amber-300' : isDecember ? 'border-2 border-red-300' : 'border-2 border-cyan-200'} hover:bg-gray-100 transition-colors flex items-center gap-2`}
        >
          <User size={16} />
          <div className="text-sm font-semibold text-gray-700">My Profile</div>
        </button>
        <button
          onClick={async () => {
            if (userId) {
              await supabase
                .from('user_activity')
                .update({
                  is_online: false,
                  last_active: new Date().toISOString()
                })
                .eq('user_id', userId);
            }
            await supabase.auth.signOut();
            setIsAuthenticated(false);
            setPets([]);
          }}
          className={`bg-white/90 backdrop-blur-sm rounded-xl shadow-lg px-4 py-2 ${isNovember ? 'border-2 border-amber-300' : isDecember ? 'border-2 border-red-300' : 'border-2 border-cyan-200'} hover:bg-gray-100 transition-colors`}
        >
          <div className="text-sm font-semibold text-gray-700">Sign Out</div>
        </button>
      </div>
      <div className="container mx-auto px-4 py-8 relative z-10">
        <div className="text-center mb-8">
          <h1 className={`text-5xl font-bold mb-3 ${isDecember ? 'text-white' : 'text-gray-800'}`}>
            Critter Cloud Companions {isNovember ? '🦃' : isDecember ? '🎄' : '🏡'}
          </h1>
          <p className={`text-lg ${isDecember ? 'text-red-100' : 'text-gray-600'}`}>
            {isNovember
              ? '🍂🥧Happy Thanksgiving! Give thanks for your fuzzy friends!🥧🍂'
              : isDecember
              ? '🎄❄️Happy Holidays! Spread joy with your festive companions!❄️🎅'
              : '✨🧋Bored? Your fuzzy (or slimy or feathery) companion is here to help cure your ennui!🧋✨'}
          </p>
        </div>

        <div className="flex flex-wrap gap-4 justify-center mb-8">
          <button
            onClick={() => {
              soundManager.play('click');
              setShowAdoptModal(true);
            }}
            className="flex items-center gap-2 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white px-6 py-3 rounded-xl font-semibold shadow-lg transition-all hover:scale-105"
          >
            <PlusCircle size={24} />
            Adopt a Pet
          </button>
          <button
            onClick={() => {
              soundManager.play('click');
              if (pets.length > 0) {
                setSelectedPetForShop(pets[0]);
              }
            }}
            className="flex items-center gap-2 bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white px-6 py-3 rounded-xl font-semibold shadow-lg transition-all hover:scale-105"
          >
            <ShoppingBag size={24} />
            Shop
          </button>
          <button
            onClick={() => {
              soundManager.play('click');
              setShowInventory(true);
            }}
            className="flex items-center gap-2 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white px-6 py-3 rounded-xl font-semibold shadow-lg transition-all hover:scale-105"
          >
            <Package size={24} />
            Inventory
          </button>
        </div>

        {actionMessage && (
          <div className="fixed top-4 right-4 bg-white shadow-xl rounded-xl px-6 py-4 z-50 animate-bounce">
            <p className="text-lg font-semibold text-gray-800">{actionMessage}</p>
          </div>
        )}

        {(() => {
          const onlinePets = pets.filter(pet => onlineUserIds.has(pet.user_id));

          if (onlinePets.length === 0) {
            return (
              <div className="text-center py-20">
                <div className="text-8xl mb-6">🐾</div>
                <h2 className="text-3xl font-bold text-gray-700 mb-4">No active pets!</h2>
                <p className="text-xl text-gray-500">
                  {totalPetCount === 0
                    ? "Start by adopting your first digital companion"
                    : "Equip a pet from your inventory or adopt a new one"}
                </p>
              </div>
            );
          }

          return (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {onlinePets.map((pet) => {
                const isOwner = pet.user_id === userId;
                const canControl = isOwner || isAdminMode;
                return (
                  <PetCard
                    key={pet.id}
                    pet={pet}
                    onFeed={canControl ? () => feedPet(pet) : () => showMessage("You can only interact with your own pets!")}
                    onPlay={canControl ? () => playWithPet(pet) : () => showMessage("You can only interact with your own pets!")}
                    onClean={canControl ? () => cleanPet(pet) : () => showMessage("You can only interact with your own pets!")}
                    onGiveWater={canControl ? () => giveWater(pet) : () => showMessage("You can only interact with your own pets!")}
                    onPlayWithToy={canControl ? () => playWithToy(pet) : () => showMessage("You can only interact with your own pets!")}
                    onOpenActivities={canControl ? () => setSelectedPetForActivities(pet) : () => showMessage("You can only interact with your own pets!")}
                    onDelete={canControl ? () => deletePet(pet) : () => showMessage("You can only interact with your own pets!")}
                    onDeactivate={canControl ? () => handleDeactivatePet(pet.id) : () => showMessage("You can only interact with your own pets!")}
                    onUnequipAccessory={canControl ? (type) => handleUnequipAccessory(pet.id, type) : undefined}
                  />
                );
              })}
            </div>
          );
        })()}
      </div>

      {showAdoptModal && (
        <AdoptPetModal
          onAdopt={adoptPet}
          onClose={() => setShowAdoptModal(false)}
          highestPetLevel={isAdminMode ? 9999 : highestPetLevel}
          existingOwnerName={pets.find(p => p.user_id === userId)?.owner_name}
          totalCoins={totalCoins}
          isAdminMode={isAdminMode}
        />
      )}

      {selectedPetForShop && (
        <ShopModal
          pet={selectedPetForShop}
          onClose={() => setSelectedPetForShop(null)}
          onPurchase={() => {
            loadPets();
            const updatedPet = pets.find(p => p.id === selectedPetForShop.id);
            if (updatedPet) {
              setSelectedPetForShop(updatedPet);
            }
          }}
        />
      )}

      {selectedPetForActivities && (
        <ActivitiesModal
          pet={selectedPetForActivities}
          onClose={() => setSelectedPetForActivities(null)}
          onStartActivity={(activityType) => startActivity(selectedPetForActivities, activityType)}
        />
      )}

      {showInventory && userId && (
        <InventoryModal
          userId={userId}
          onClose={() => setShowInventory(false)}
          onActivatePet={handleActivatePet}
          onDeactivatePet={handleDeactivatePet}
          onApplyAccessory={handleApplyAccessory}
          onPlaceHouseItem={handlePlaceHouseItem}
          activePets={pets.filter(p => p.user_id === userId)}
        />
      )}

      <GlobalPetsSidebar
        currentUserId={userId || undefined}
        isUpperAdmin={showUpperAdmin}
        isNovember={isNovember}
        isDecember={isDecember}
        onTradeInitiate={(userId, userName) => {
          setTradeWithUserId(userId);
          setTradeWithUserName(userName);
        }}
      />
      <MusicPlayer onAdminUnlock={() => {
        setIsAdminMode(true);
        showMessage('Admin mode activated! You can now control all pets!');
      }} />
      <SoundControl />
      <ChatPanel userId={userId!} username={username} />

      <button
        onClick={() => {
          soundManager.play('click');
          setShowHouse(true);
        }}
        className="fixed bottom-6 right-6 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white p-4 rounded-full shadow-2xl transition-all hover:scale-110 z-30 group"
        title="Go to your house"
      >
        <div className="text-3xl">🏡</div>
      </button>

      {showHouse && <House userId={userId!} onClose={() => setShowHouse(false)} />}
      {showProfile && userId && (
        <ProfileModal
          userId={userId}
          ownerName={username}
          onClose={() => setShowProfile(false)}
        />
      )}
      {showCodePrompt && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-[60]">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <ShieldAlert className="text-red-500" size={32} />
              <h3 className="text-xl font-bold">Upper Admin Access</h3>
            </div>
            <p className="text-gray-600 mb-4">
              Enter the admin code to access the upper admin panel:
            </p>
            <input
              type="password"
              value={adminCode}
              onChange={(e) => setAdminCode(e.target.value)}
              onKeyPress={async (e) => {
                if (e.key === 'Enter') {
                  if (adminCode === 'TADC6767REALIE') {
                    try {
                      await supabase.rpc('add_first_admin', { new_admin_id: userId });
                    } catch (error) {
                      console.log('Admin setup message:', error);
                    }
                    setShowUpperAdmin(true);
                    setShowCodePrompt(false);
                    setAdminCode('');
                    sessionStorage.setItem('upperAdminMode', 'true');
                    alert('Admin access granted!');
                  } else {
                    alert('Incorrect code!');
                    setAdminCode('');
                  }
                }
              }}
              placeholder="Enter admin code..."
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-red-500 focus:outline-none text-lg"
            />
            <div className="flex gap-3 mt-4">
              <button
                onClick={() => {
                  setShowCodePrompt(false);
                  setAdminCode('');
                }}
                className="flex-1 px-4 py-3 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-xl font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (adminCode === 'TADC6767REALIE') {
                    try {
                      await supabase.rpc('add_first_admin', { new_admin_id: userId });
                    } catch (error) {
                      console.log('Admin setup message:', error);
                    }
                    setShowUpperAdmin(true);
                    setShowCodePrompt(false);
                    setAdminCode('');
                    sessionStorage.setItem('upperAdminMode', 'true');
                    alert('Admin access granted!');
                  } else {
                    alert('Incorrect code!');
                    setAdminCode('');
                  }
                }}
                className="flex-1 px-4 py-3 bg-red-500 hover:bg-red-600 text-white rounded-xl font-semibold transition-colors"
              >
                Submit
              </button>
            </div>
          </div>
        </div>
      )}
      {showUpperAdmin && userId && (
        <UpperAdminPanel
          onClose={() => setShowUpperAdmin(false)}
          currentUserId={userId}
          isSuperAdmin={isSuperAdmin}
        />
      )}
      {tradeWithUserId && userId && (
        <TradeInitiateModal
          recipientUserId={tradeWithUserId}
          recipientName={tradeWithUserName}
          currentUserId={userId}
          onClose={() => {
            setTradeWithUserId(null);
            setTradeWithUserName('');
          }}
          onComplete={() => {
            setTradeWithUserId(null);
            setTradeWithUserName('');
            loadPendingTrades();
          }}
        />
      )}
      {selectedTrade && userId && (
        <TradeAcceptModal
          trade={selectedTrade}
          currentUserId={userId}
          onClose={() => setSelectedTrade(null)}
          onComplete={() => {
            setSelectedTrade(null);
            setShowIncomingNotification(false);
            setIncomingTrade(null);
            loadPendingTrades();
          }}
        />
      )}
      {showIncomingNotification && userId && (
        <IncomingTradeNotification
          incomingTrade={incomingTrade}
          onOpenTrade={(trade) => setSelectedTrade(trade)}
          onClose={() => {
            setShowIncomingNotification(false);
            setIncomingTrade(null);
          }}
        />
      )}
      {pendingTrades.length > 0 && !selectedTrade && !showIncomingNotification && (
        <div className="fixed bottom-6 right-6 z-[100]">
          <button
            onClick={() => setSelectedTrade(pendingTrades[0])}
            className="bg-gradient-to-r from-pink-500 to-pink-400 hover:from-pink-600 hover:to-pink-500 text-white px-6 py-3 rounded-xl font-bold shadow-2xl transition-transform hover:scale-105 animate-bounce flex items-center gap-2"
          >
            <span className="text-xl">💱</span>
            {pendingTrades.length} Trade{pendingTrades.length !== 1 ? 's' : ''}
          </button>
        </div>
      )}
    </div>
  );
}

export default App;
