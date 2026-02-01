import { useState, useEffect } from 'react';
import { X, Plus, Trash2, Lock } from 'lucide-react';
import { supabase, type TradeRequest, type Pet } from '../lib/supabase';

interface TradeAcceptModalProps {
  trade: TradeRequest;
  currentUserId: string;
  onClose: () => void;
  onComplete: () => void;
}

const PET_EMOJIS: Record<Pet['type'], string> = {
  cat: '🐱', dog: '🐶', fox: '🦊', bird: '🐦', rabbit: '🐰', bear: '🐻', panda: '🐼', koala: '🐨',
  hamster: '🐹', mouse: '🐭', pig: '🐷', frog: '🐸', monkey: '🐵', lion: '🦁', tiger: '🐯', cow: '🐮',
  turkey: '🦃', dragon: '🐉', shark: '🦈', seal: '🦭', crocodile: '🐊', flamingo: '🦩', duck: '🦆',
  turtle: '🐢', butterfly: '🦋', elephant: '🐘', giraffe: '🦒', dinosaur: '🦕', crab: '🦀', lobster: '🦞',
  shrimp: '🦐', squid: '🦑', octopus: '🐙', pufferfish: '🐡', eagle: '🦅', owl: '🦉', bat: '🦇',
  bee: '🐝', unicorn: '🦄', boar: '🐗', dolphin: '🐬', whale: '🐳', leopard: '🐆', swan: '🦢',
  parrot: '🦜', badger: '🦡', rat: '🐀', squirrel: '🐿', hedgehog: '🦔', rhino: '🦏', waterbuffalo: '🐃',
  kangaroo: '🦘', camel: '🐫', dromedary: '🐪', ox: '🐂', horse: '🐎', ram: '🐏', deer: '🦌',
  goat: '🐐', sheep: '🐑'
};

interface ItemWithEmoji {
  id: string;
  name: string;
  emoji: string;
  type: string;
}

export function TradeAcceptModal({ trade, currentUserId, onClose, onComplete }: TradeAcceptModalProps) {
  const [senderItems, setSenderItems] = useState<ItemWithEmoji[]>([]);
  const [recipientItems, setRecipientItems] = useState<ItemWithEmoji[]>([]);
  const [senderName, setSenderName] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [senderConfirmed, setSenderConfirmed] = useState(false);
  const [recipientConfirmed, setRecipientConfirmed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [showInventory, setShowInventory] = useState(false);
  const [availableItems, setAvailableItems] = useState<ItemWithEmoji[]>([]);

  const isRecipient = currentUserId === trade.recipient_id;
  const isSender = currentUserId === trade.sender_id;
  const currentUserConfirmed = isRecipient ? recipientConfirmed : senderConfirmed;
  const currentUserItems = isRecipient ? recipientItems : senderItems;

  useEffect(() => {
    loadTradeDetails();

    const subscription = supabase
      .channel(`trade-${trade.id}`)
      .on('postgres_changes', {
        event: 'DELETE',
        schema: 'public',
        table: 'trade_requests',
        filter: `id=eq.${trade.id}`
      }, () => {
        onComplete();
        onClose();
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'trade_requests',
        filter: `id=eq.${trade.id}`
      }, (payload) => {
        if (payload.new.status === 'accepted') {
          onComplete();
          onClose();
        } else {
          setSenderConfirmed(payload.new.sender_confirmed);
          setRecipientConfirmed(payload.new.recipient_confirmed);
        }
      })
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [trade.id]);

  const loadTradeDetails = async () => {
    try {
      const { data: items } = await supabase
        .from('trade_items')
        .select('*')
        .eq('trade_request_id', trade.id);

      if (items) {
        const senderItemsData = items.filter(i => i.sender_offering).map(i => ({
          id: i.item_id,
          name: i.item_name,
          emoji: i.item_emoji,
          type: i.item_type,
        }));
        const recipientItemsData = items.filter(i => !i.sender_offering).map(i => ({
          id: i.item_id,
          name: i.item_name,
          emoji: i.item_emoji,
          type: i.item_type,
        }));

        setSenderItems(senderItemsData);
        setRecipientItems(recipientItemsData);
      }

      const { data: senderData } = await supabase
        .from('user_settings')
        .select('display_name, username')
        .eq('user_id', trade.sender_id)
        .maybeSingle();

      const { data: recipientData } = await supabase
        .from('user_settings')
        .select('display_name, username')
        .eq('user_id', trade.recipient_id)
        .maybeSingle();

      setSenderName(senderData?.display_name || senderData?.username || 'Trader');
      setRecipientName(recipientData?.display_name || recipientData?.username || 'Trader');

      const { data: tradeData } = await supabase
        .from('trade_requests')
        .select('sender_confirmed, recipient_confirmed')
        .eq('id', trade.id)
        .maybeSingle();

      if (tradeData) {
        setSenderConfirmed(tradeData.sender_confirmed);
        setRecipientConfirmed(tradeData.recipient_confirmed);
      }

      if (isRecipient || isSender) {
        await loadAvailableItems(currentUserId);
      }
    } catch (error) {
      console.error('Error loading trade details:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadAvailableItems = async (userId: string) => {
    try {
      const [{ data: pets }, { data: accessories }, { data: houseItems }] = await Promise.all([
        supabase.from('pets').select('*').eq('user_id', userId),
        supabase.from('accessory_inventory').select('*').eq('user_id', userId).gt('quantity', 0),
        supabase.from('house_inventory').select('*').eq('user_id', userId).eq('placed', false),
      ]);

      const items: ItemWithEmoji[] = [
        ...(pets || []).map(p => ({
          id: p.id,
          name: p.name,
          emoji: PET_EMOJIS[p.type as Pet['type']],
          type: 'pet',
        })),
        ...(accessories || []).map(a => ({
          id: a.id,
          name: a.item_name,
          emoji: a.item_emoji,
          type: a.item_type,
        })),
        ...(houseItems || []).map(h => ({
          id: h.id,
          name: h.item_name,
          emoji: h.item_emoji,
          type: h.item_type,
        })),
      ];

      setAvailableItems(items);
    } catch (error) {
      console.error('Error loading available items:', error);
    }
  };

  const addItem = async (item: ItemWithEmoji) => {
    const itemsToUpdate = isRecipient ? recipientItems : senderItems;
    const newItems = [...itemsToUpdate, item];

    if (isRecipient) {
      setRecipientItems(newItems);
    } else {
      setSenderItems(newItems);
    }

    const { error } = await supabase
      .from('trade_items')
      .insert({
        trade_request_id: trade.id,
        sender_offering: isSender,
        item_id: item.id,
        item_type: item.type,
        item_name: item.name,
        item_emoji: item.emoji,
      });

    if (error) {
      console.error('Error adding item:', error);
      if (isRecipient) {
        setRecipientItems(itemsToUpdate);
      } else {
        setSenderItems(itemsToUpdate);
      }
    }
  };

  const removeItem = async (itemId: string) => {
    const itemsToUpdate = isRecipient ? recipientItems : senderItems;
    const newItems = itemsToUpdate.filter(i => i.id !== itemId);

    if (isRecipient) {
      setRecipientItems(newItems);
    } else {
      setSenderItems(newItems);
    }

    const { error } = await supabase
      .from('trade_items')
      .delete()
      .eq('trade_request_id', trade.id)
      .eq('item_id', itemId)
      .eq('sender_offering', isSender);

    if (error) {
      console.error('Error removing item:', error);
      if (isRecipient) {
        setRecipientItems(itemsToUpdate);
      } else {
        setSenderItems(itemsToUpdate);
      }
    }
  };

  const toggleConfirm = async () => {
    setProcessing(true);
    try {
      const updates = isRecipient
        ? { recipient_confirmed: !recipientConfirmed }
        : { sender_confirmed: !senderConfirmed };

      const { error } = await supabase
        .from('trade_requests')
        .update(updates)
        .eq('id', trade.id);

      if (error) throw error;

      if (isRecipient) {
        setRecipientConfirmed(!recipientConfirmed);
      } else {
        setSenderConfirmed(!senderConfirmed);
      }
    } catch (error) {
      console.error('Error toggling confirm:', error);
    } finally {
      setProcessing(false);
    }
  };

  const handleDecline = async () => {
    setProcessing(true);
    try {
      const { error } = await supabase
        .from('trade_requests')
        .delete()
        .eq('id', trade.id);

      if (error) throw error;

      setTimeout(() => {
        onComplete();
        onClose();
      }, 100);
    } catch (error) {
      console.error('Error declining trade:', error);
      alert('Failed to decline trade');
    } finally {
      setProcessing(false);
    }
  };

  const handleFinalizeTrade = async () => {
    setProcessing(true);
    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/accept-trade`;
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token || ''}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ tradeId: trade.id }),
      });

      if (!response.ok) throw new Error('Failed to finalize trade');

      onComplete();
      onClose();
    } catch (error) {
      console.error('Error finalizing trade:', error);
      alert('Failed to finalize trade');
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
        <div className="bg-white rounded-3xl p-8">
          <p className="text-gray-500">Loading trade...</p>
        </div>
      </div>
    );
  }

  const senderLabel = isSender ? 'You' : senderName;
  const recipientLabel = isRecipient ? 'You' : recipientName;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 z-50 overflow-y-auto">
      <div className="bg-gradient-to-br from-pink-100 to-pink-50 rounded-2xl sm:rounded-3xl shadow-2xl p-4 sm:p-8 max-w-5xl w-full border-2 sm:border-4 border-pink-300 my-4 sm:my-8">
        <div className="flex items-center justify-between mb-4 sm:mb-8">
          <h2 className="text-xl sm:text-3xl font-bold text-pink-600">Negotiate Trade</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors p-1 flex-shrink-0"
          >
            <X size={20} className="sm:w-7 sm:h-7" />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2 sm:gap-6 items-start">
          <div>
            <div className="text-xs sm:text-sm font-bold text-pink-600 text-center mb-2 sm:mb-3">
              {senderLabel} offers
            </div>
            <div className="bg-white rounded-xl sm:rounded-2xl border-2 sm:border-4 border-pink-400 p-2 sm:p-4 min-h-60 sm:min-h-80">
              <div className="grid grid-cols-3 gap-1 sm:gap-2 mb-2 sm:mb-4">
                {Array.from({ length: 9 }).map((_, i) => {
                  const item = senderItems[i];
                  return (
                    <div
                      key={i}
                      className={`aspect-square rounded-lg sm:rounded-xl border-2 sm:border-3 flex items-center justify-center relative group ${
                        item
                          ? 'border-pink-300 bg-pink-50'
                          : 'border-pink-300 bg-pink-50'
                      }`}
                    >
                      {item ? (
                        <>
                          <div className="text-lg sm:text-3xl">{item.emoji}</div>
                          {isSender && (
                            <button
                              onClick={() => removeItem(item.id)}
                              className="absolute -top-1 -right-1 sm:-top-2 sm:-right-2 bg-red-500 text-white rounded-full p-0.5 sm:p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <Trash2 size={12} className="sm:w-3.5 sm:h-3.5" />
                            </button>
                          )}
                        </>
                      ) : null}
                    </div>
                  );
                })}
              </div>
              {isSender && (
                <button
                  onClick={() => setShowInventory(!showInventory)}
                  className="w-full py-1 sm:py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg font-bold flex items-center justify-center gap-1 sm:gap-2 transition-colors text-xs sm:text-base"
                >
                  <Plus size={16} className="sm:w-5 sm:h-5" /> Add Item
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-col items-center gap-2 sm:gap-4 py-6 sm:py-12">
            <div className="text-2xl sm:text-4xl font-bold text-pink-600">TRADE</div>
            <div className="bg-pink-400 rounded-full p-2 sm:p-4">
              <svg className="w-5 h-5 sm:w-8 sm:h-8 text-white animate-pulse" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            </div>
            {senderConfirmed && recipientConfirmed && (
              <div className="flex items-center gap-1 sm:gap-2 text-green-600 font-bold text-xs sm:text-base">
                <Lock size={16} className="sm:w-5 sm:h-5" /> Ready
              </div>
            )}
            {!(senderConfirmed && recipientConfirmed) && (
              <div className="flex items-center gap-1 sm:gap-2 text-yellow-600 font-bold text-xs sm:text-base">
                <Lock size={16} className="sm:w-5 sm:h-5" /> Waiting
              </div>
            )}
          </div>

          <div>
            <div className="text-xs sm:text-sm font-bold text-pink-600 text-center mb-2 sm:mb-3">
              {recipientLabel} offers
            </div>
            <div className="bg-white rounded-xl sm:rounded-2xl border-2 sm:border-4 border-pink-400 p-2 sm:p-4 min-h-60 sm:min-h-80">
              <div className="grid grid-cols-3 gap-1 sm:gap-2 mb-2 sm:mb-4">
                {Array.from({ length: 9 }).map((_, i) => {
                  const item = recipientItems[i];
                  return (
                    <div
                      key={i}
                      className={`aspect-square rounded-lg sm:rounded-xl border-2 sm:border-3 flex items-center justify-center relative group ${
                        item
                          ? 'border-pink-300 bg-pink-50'
                          : 'border-pink-300 bg-pink-50'
                      }`}
                    >
                      {item ? (
                        <>
                          <div className="text-lg sm:text-3xl">{item.emoji}</div>
                          {isRecipient && (
                            <button
                              onClick={() => removeItem(item.id)}
                              className="absolute -top-1 -right-1 sm:-top-2 sm:-right-2 bg-red-500 text-white rounded-full p-0.5 sm:p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <Trash2 size={12} className="sm:w-3.5 sm:h-3.5" />
                            </button>
                          )}
                        </>
                      ) : null}
                    </div>
                  );
                })}
              </div>
              {isRecipient && (
                <button
                  onClick={() => setShowInventory(!showInventory)}
                  className="w-full py-1 sm:py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg font-bold flex items-center justify-center gap-1 sm:gap-2 transition-colors text-xs sm:text-base"
                >
                  <Plus size={16} className="sm:w-5 sm:h-5" /> Add Item
                </button>
              )}
            </div>
          </div>
        </div>

        {showInventory && (
          <div className="mt-3 sm:mt-6 bg-white rounded-xl sm:rounded-2xl border-2 border-pink-300 p-3 sm:p-4">
            <h3 className="font-bold text-pink-600 mb-2 sm:mb-3 text-sm sm:text-base">Your Available Items</h3>
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-1 sm:gap-2 max-h-40 sm:max-h-48 overflow-y-auto">
              {availableItems
                .filter(item => !currentUserItems.some(ui => ui.id === item.id))
                .map(item => (
                  <button
                    key={item.id}
                    onClick={() => {
                      addItem(item);
                      setShowInventory(false);
                    }}
                    className="aspect-square rounded-lg border-2 border-pink-300 hover:border-pink-500 hover:bg-pink-100 bg-pink-50 flex flex-col items-center justify-center gap-0.5 transition-all"
                    title={item.name}
                  >
                    <div className="text-lg sm:text-2xl">{item.emoji}</div>
                    <div className="text-xs text-center text-gray-600 line-clamp-1">{item.name}</div>
                  </button>
                ))}
            </div>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 mt-4 sm:mt-8">
          <button
            onClick={handleDecline}
            disabled={processing}
            className="flex-1 px-3 sm:px-6 py-2 sm:py-3 rounded-xl border-2 border-red-400 text-red-700 font-bold hover:bg-red-50 transition-colors disabled:opacity-50 text-xs sm:text-base"
          >
            {processing ? 'Declining...' : 'Decline'}
          </button>
          <button
            onClick={toggleConfirm}
            disabled={processing || currentUserItems.length === 0}
            className={`flex-1 px-3 sm:px-6 py-2 sm:py-3 rounded-xl font-bold transition-all text-xs sm:text-base ${
              currentUserConfirmed
                ? 'bg-green-500 hover:bg-green-600 text-white'
                : 'bg-gray-400 hover:bg-gray-500 text-white'
            } disabled:opacity-50`}
          >
            {currentUserConfirmed ? '✓ Confirmed' : 'Confirm Items'}
          </button>
          <button
            onClick={handleFinalizeTrade}
            disabled={processing || !(senderConfirmed && recipientConfirmed)}
            className="flex-1 px-3 sm:px-6 py-2 sm:py-3 rounded-xl bg-gradient-to-r from-pink-500 to-pink-400 text-white font-bold hover:shadow-lg disabled:opacity-50 transition-all text-xs sm:text-base"
          >
            {processing ? 'Processing...' : 'Finalize Trade'}
          </button>
        </div>
      </div>
    </div>
  );
}
