import { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../api/firebase';
import { Settings as SettingsIcon, Save, MessageSquare, AlertCircle, CheckCircle } from 'lucide-react';

export default function Settings() {
  const [telegramConfig, setTelegramConfig] = useState({
    botToken: '8306442379:AAFce7VAr15i5pojZD6s8oxG-vPOjTSZtvQ',
    chatId: '7737305738',
    isActive: true
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testStatus, setTestStatus] = useState<'idle' | 'success' | 'error'>('idle');

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const docRef = doc(db, 'settings', 'telegram');
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        setTelegramConfig(docSnap.data() as any);
      }
    } catch (error) {
      console.error("Error fetching settings:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await setDoc(doc(db, 'settings', 'telegram'), telegramConfig);
      alert('Pengaturan berhasil disimpan!');
    } catch (error) {
      console.error("Error saving settings:", error);
      alert('Gagal menyimpan pengaturan.');
    } finally {
      setSaving(false);
    }
  };

  const handleGetChatId = async () => {
    if (!telegramConfig.botToken) {
      alert('Mohon isi Bot Token terlebih dahulu.');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`https://api.telegram.org/bot${telegramConfig.botToken}/getUpdates`);
      const data = await response.json();

      if (data.ok && data.result.length > 0) {
        // Get the last chat ID from updates
        const lastUpdate = data.result[data.result.length - 1];
        const chatId = lastUpdate.message?.chat.id || lastUpdate.my_chat_member?.chat.id;
        
        if (chatId) {
          setTelegramConfig(prev => ({ ...prev, chatId: chatId.toString() }));
          alert(`Chat ID ditemukan: ${chatId}`);
        } else {
          alert('Tidak dapat menemukan Chat ID dari update terakhir. Coba kirim pesan "halo" ke bot Anda terlebih dahulu.');
        }
      } else {
        alert('Tidak ada update ditemukan. Pastikan Anda sudah mengirim pesan ke bot Anda.');
      }
    } catch (error) {
      console.error("Error getting updates:", error);
      alert('Gagal mengambil update dari Telegram.');
    } finally {
      setLoading(false);
    }
  };

  const handleTestMessage = async () => {
    if (!telegramConfig.botToken || !telegramConfig.chatId) {
      alert('Mohon lengkapi Bot Token dan Chat ID terlebih dahulu.');
      return;
    }

    setTestStatus('idle');
    try {
      const message = "🔔 *Tes Notifikasi POS*\n\nIni adalah pesan uji coba integrasi Telegram.";
      const url = `https://api.telegram.org/bot${telegramConfig.botToken}/sendMessage`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: telegramConfig.chatId,
          text: message,
          parse_mode: 'Markdown'
        })
      });

      const data = await response.json();
      
      if (data.ok) {
        setTestStatus('success');
        alert('Pesan tes berhasil dikirim! Silakan cek Telegram Anda.');
      } else {
        console.error('Telegram API Error:', data);
        if (data.description?.includes('chat not found')) {
          throw new Error('Chat ID tidak ditemukan. Pastikan Anda sudah menekan START pada bot Anda.');
        }
        throw new Error(data.description || 'Gagal mengirim pesan');
      }
    } catch (error: any) {
      console.error("Test message error:", error);
      setTestStatus('error');
      alert(`Gagal mengirim pesan tes: ${error.message}`);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3 mb-8">
        <div className="p-3 bg-slate-100 rounded-xl">
          <SettingsIcon className="w-8 h-8 text-slate-700" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Pengaturan</h1>
          <p className="text-slate-500">Konfigurasi sistem dan integrasi</p>
        </div>
      </div>

      {/* Telegram Integration Card */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-6 border-b border-slate-100 bg-slate-50 flex items-center gap-3">
          <MessageSquare className="w-6 h-6 text-blue-500" />
          <h2 className="text-lg font-bold text-slate-800">Integrasi Telegram Bot</h2>
        </div>
        
        <div className="p-6">
          <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 mb-6 text-sm text-blue-700 flex gap-3 items-start">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold mb-1">Cara mendapatkan Bot Token & Chat ID:</p>
              <ul className="list-disc list-inside space-y-1 ml-1 opacity-90">
                <li>Buat bot baru di Telegram melalui <strong>@BotFather</strong> untuk mendapatkan <strong>Bot Token</strong>.</li>
                <li>Mulai chat dengan bot baru Anda.</li>
                <li>Kirim pesan ke bot Anda, lalu buka <code>https://api.telegram.org/bot[TOKEN]/getUpdates</code> untuk melihat <strong>Chat ID</strong> Anda.</li>
              </ul>
            </div>
          </div>

          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Bot Token</label>
              <input
                type="text"
                value={telegramConfig.botToken}
                onChange={(e) => setTelegramConfig({ ...telegramConfig, botToken: e.target.value })}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all font-mono text-sm"
                placeholder="123456789:ABCdefGHIjklMNOpqrsTUVwxyz"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Chat ID</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={telegramConfig.chatId}
                  onChange={(e) => setTelegramConfig({ ...telegramConfig, chatId: e.target.value })}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all font-mono text-sm"
                  placeholder="-100123456789"
                />
                <button
                  type="button"
                  onClick={handleGetChatId}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg font-medium transition-colors text-sm whitespace-nowrap"
                >
                  Cari Chat ID
                </button>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Tips: Kirim pesan ke bot Anda, lalu klik "Cari Chat ID" untuk mengisi otomatis.
              </p>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <input
                type="checkbox"
                id="isActive"
                checked={telegramConfig.isActive}
                onChange={(e) => setTelegramConfig({ ...telegramConfig, isActive: e.target.checked })}
                className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
              />
              <label htmlFor="isActive" className="text-sm text-slate-700 font-medium select-none">
                Aktifkan Notifikasi Telegram
              </label>
            </div>

            <div className="pt-6 flex items-center justify-between border-t border-slate-100 mt-6">
              <button
                type="button"
                onClick={handleTestMessage}
                disabled={!telegramConfig.botToken || !telegramConfig.chatId}
                className="px-4 py-2 text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                {testStatus === 'success' ? <CheckCircle className="w-4 h-4 text-green-600" /> : <MessageSquare className="w-4 h-4" />}
                Tes Pesan
              </button>

              <button
                type="submit"
                disabled={saving || loading}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold shadow-lg shadow-blue-200 transition-all flex items-center gap-2 disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                {saving ? 'Menyimpan...' : 'Simpan Pengaturan'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}