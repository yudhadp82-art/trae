import { useEffect, useState } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import {
  AlertCircle,
  BookOpen,
  CheckCircle,
  Code2,
  ExternalLink,
  LoaderCircle,
  MessageSquare,
  Save,
  Search,
  Settings as SettingsIcon,
} from 'lucide-react';
import { db } from '../api/firebase';
import { getContext7Documentation, searchContext7Libraries } from '../api/context7';
import { useAppFeedback } from '../components/useAppFeedback';

type TelegramConfig = {
  botToken: string;
  chatId: string;
  isActive: boolean;
};

type Context7Result = {
  id: string;
  title: string;
  description?: string;
};

type Context7ViewState = {
  codeSnippets?: Array<{
    codeTitle?: string;
    codeDescription?: string;
    codeLanguage?: string;
    pageTitle?: string;
    codeList?: Array<{ language?: string; code: string }>;
  }>;
  infoSnippets?: Array<{
    pageId?: string;
    breadcrumb?: string;
    content: string;
  }>;
};

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Unknown error';
}

export default function Settings() {
  const { notify } = useAppFeedback();
  const [telegramConfig, setTelegramConfig] = useState<TelegramConfig>({
    botToken: '8306442379:AAFce7VAr15i5pojZD6s8oxG-vPOjTSZtvQ',
    chatId: '7737305738',
    isActive: true,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testStatus, setTestStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [libraryName, setLibraryName] = useState('react');
  const [docQuery, setDocQuery] = useState('how to use useEffect');
  const [selectedLibraryId, setSelectedLibraryId] = useState('/facebook/react');
  const [contextType, setContextType] = useState<'docs' | 'code'>('docs');
  const [context7Loading, setContext7Loading] = useState(false);
  const [context7Error, setContext7Error] = useState('');
  const [libraries, setLibraries] = useState<Context7Result[]>([]);
  const [docResult, setDocResult] = useState<Context7ViewState | null>(null);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const docRef = doc(db, 'settings', 'telegram');
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data() as Partial<TelegramConfig>;
        setTelegramConfig({
          botToken: data.botToken || '',
          chatId: data.chatId || '',
          isActive: Boolean(data.isActive),
        });
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await setDoc(doc(db, 'settings', 'telegram'), telegramConfig);
      notify({
        title: 'Pengaturan berhasil disimpan',
        description: 'Konfigurasi Telegram sudah diperbarui.',
        tone: 'success',
      });
    } catch (error) {
      console.error('Error saving settings:', error);
      notify({
        title: 'Pengaturan gagal disimpan',
        description: 'Coba ulangi penyimpanan konfigurasi.',
        tone: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleGetChatId = async () => {
    if (!telegramConfig.botToken) {
      notify({
        title: 'Bot Token belum diisi',
        description: 'Masukkan Bot Token sebelum mencari Chat ID.',
        tone: 'error',
      });
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`https://api.telegram.org/bot${telegramConfig.botToken}/getUpdates`);
      const data = await response.json();

      if (data.ok && data.result.length > 0) {
        const lastUpdate = data.result[data.result.length - 1];
        const chatId = lastUpdate.message?.chat.id || lastUpdate.my_chat_member?.chat.id;

        if (chatId) {
          setTelegramConfig((prev) => ({ ...prev, chatId: chatId.toString() }));
          notify({
            title: `Chat ID ditemukan: ${chatId}`,
            description: 'Nilai Chat ID sudah diisikan otomatis.',
            tone: 'success',
          });
        } else {
          notify({
            title: 'Chat ID belum ditemukan',
            description: 'Kirim pesan ke bot lalu coba ambil ulang update terakhir.',
            tone: 'error',
          });
        }
      } else {
        notify({
          title: 'Belum ada update Telegram',
          description: 'Pastikan Anda sudah mengirim pesan ke bot.',
          tone: 'error',
        });
      }
    } catch (error) {
      console.error('Error getting updates:', error);
      notify({
        title: 'Gagal mengambil update Telegram',
        description: 'Periksa Bot Token lalu coba lagi.',
        tone: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleTestMessage = async () => {
    if (!telegramConfig.botToken || !telegramConfig.chatId) {
      notify({
        title: 'Konfigurasi Telegram belum lengkap',
        description: 'Isi Bot Token dan Chat ID terlebih dahulu.',
        tone: 'error',
      });
      return;
    }

    setTestStatus('idle');
    try {
      const message = 'Tes Notifikasi POS\n\nIni adalah pesan uji coba integrasi Telegram.';
      const url = `https://api.telegram.org/bot${telegramConfig.botToken}/sendMessage`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: telegramConfig.chatId,
          text: message,
          parse_mode: 'Markdown',
        }),
      });

      const data = await response.json();

      if (data.ok) {
        setTestStatus('success');
        notify({
          title: 'Pesan tes berhasil dikirim',
          description: 'Periksa Telegram Anda untuk memastikan notifikasi masuk.',
          tone: 'success',
        });
      } else {
        console.error('Telegram API Error:', data);
        if (data.description?.includes('chat not found')) {
          throw new Error('Chat ID tidak ditemukan. Pastikan Anda sudah menekan START pada bot Anda.');
        }
        throw new Error(data.description || 'Gagal mengirim pesan');
      }
    } catch (error) {
      console.error('Test message error:', error);
      setTestStatus('error');
      notify({
        title: 'Pesan tes gagal dikirim',
        description: getErrorMessage(error),
        tone: 'error',
      });
    }
  };

  const handleLibrarySearch = async () => {
    if (!libraryName.trim()) {
      notify({
        title: 'Nama library belum diisi',
        description: 'Masukkan nama library sebelum memulai pencarian.',
        tone: 'error',
      });
      return;
    }

    setContext7Loading(true);
    setContext7Error('');
    try {
      const result = await searchContext7Libraries(libraryName.trim(), docQuery.trim());
      const nextLibraries = result.results || [];
      setLibraries(nextLibraries);
      if (nextLibraries[0]?.id) {
        setSelectedLibraryId(nextLibraries[0].id);
      }
      if (nextLibraries.length === 0) {
        notify({
          title: 'Library tidak ditemukan',
          description: 'Coba nama library lain atau query yang lebih spesifik.',
          tone: 'info',
        });
      } else {
        notify({
          title: `${nextLibraries.length} library ditemukan`,
          description: 'Pilih library yang paling sesuai untuk mengambil dokumentasi.',
          tone: 'success',
        });
      }
    } catch (error) {
      setContext7Error(getErrorMessage(error));
    } finally {
      setContext7Loading(false);
    }
  };

  const handleDocumentationSearch = async () => {
    if (!selectedLibraryId.trim() || !docQuery.trim()) {
      notify({
        title: 'Library ID atau query belum lengkap',
        description: 'Pilih library dan isi query dokumentasi terlebih dahulu.',
        tone: 'error',
      });
      return;
    }

    setContext7Loading(true);
    setContext7Error('');
    try {
      const result = await getContext7Documentation({
        libraryId: selectedLibraryId.trim(),
        query: docQuery.trim(),
        type: contextType,
      });
      setDocResult(result);
      notify({
        title: 'Dokumentasi berhasil diambil',
        description: 'Hasil Context7 sudah ditampilkan di panel bawah.',
        tone: 'success',
      });
    } catch (error) {
      setContext7Error(getErrorMessage(error));
    } finally {
      setContext7Loading(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <section className="relative overflow-hidden rounded-[32px] border border-white/70 bg-[linear-gradient(135deg,rgba(15,23,42,0.96),rgba(30,41,59,0.92)_42%,rgba(14,165,233,0.82))] px-6 py-7 text-white shadow-[0_24px_80px_rgba(15,23,42,0.18)] md:px-8 md:py-9">
        <div className="absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.15),transparent_58%)]" />
        <div className="relative flex items-start gap-4">
          <div className="rounded-2xl bg-white/12 p-3 backdrop-blur-md">
            <SettingsIcon className="h-8 w-8 text-white" />
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.28em] text-sky-100/75">System Control</p>
            <h1 className="text-3xl font-bold tracking-tight">Pengaturan & Integrasi</h1>
            <p className="mt-3 max-w-2xl text-sm text-slate-100/80 md:text-base">
              Kelola Telegram bot dan Context7 dari satu panel yang lebih rapi, lebih mudah discan, dan lebih aman dipakai harian.
            </p>
          </div>
        </div>
      </section>

      <div className="section-shell overflow-hidden">
        <div className="flex items-center gap-3 border-b border-slate-100/80 bg-slate-50/75 p-6">
          <MessageSquare className="w-6 h-6 text-blue-500" />
          <div>
            <p className="section-headline mb-1">Messaging</p>
            <h2 className="text-lg font-bold text-slate-800">Integrasi Telegram Bot</h2>
          </div>
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
                Tips: Kirim pesan ke bot Anda, lalu klik &quot;Cari Chat ID&quot; untuk mengisi otomatis.
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

      <div className="section-shell overflow-hidden">
        <div className="flex items-center gap-3 border-b border-slate-100/80 bg-slate-50/75 p-6">
          <BookOpen className="w-6 h-6 text-emerald-600" />
          <div>
            <p className="section-headline mb-1">Docs Retrieval</p>
            <h2 className="text-lg font-bold text-slate-800">Integrasi Context7</h2>
            <p className="text-sm text-slate-500">Cari library dan tarik potongan dokumentasi langsung dari Context7</p>
          </div>
        </div>

        <div className="p-6 space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Nama Library</label>
              <input
                type="text"
                value={libraryName}
                onChange={(e) => setLibraryName(e.target.value)}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
                placeholder="react, next.js, firebase"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Query Dokumentasi</label>
              <input
                type="text"
                value={docQuery}
                onChange={(e) => setDocQuery(e.target.value)}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
                placeholder="how to use useEffect"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleLibrarySearch}
              disabled={context7Loading}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              {context7Loading ? <LoaderCircle className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              Cari Library
            </button>

            <button
              type="button"
              onClick={handleDocumentationSearch}
              disabled={context7Loading}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg font-semibold transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              {context7Loading ? <LoaderCircle className="w-4 h-4 animate-spin" /> : <Code2 className="w-4 h-4" />}
              Ambil Dokumentasi
            </button>
          </div>

          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Library ID</label>
              <input
                type="text"
                value={selectedLibraryId}
                onChange={(e) => setSelectedLibraryId(e.target.value)}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all font-mono text-sm"
                placeholder="/facebook/react"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Mode</label>
              <select
                value={contextType}
                onChange={(e) => setContextType(e.target.value as 'docs' | 'code')}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
              >
                <option value="docs">Docs</option>
                <option value="code">Code</option>
              </select>
            </div>
          </div>

          {context7Error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
              {context7Error}
            </div>
          )}

          {libraries.length > 0 && (
            <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-slate-50/45">
              <div className="border-b border-slate-100 bg-white/80 px-4 py-3 font-semibold text-slate-700">
                Hasil Library
              </div>
              <div className="divide-y divide-slate-100">
                {libraries.slice(0, 5).map((library) => (
                  <button
                    key={library.id}
                    type="button"
                    onClick={() => setSelectedLibraryId(library.id)}
                    className={`w-full text-left px-4 py-3 transition-colors ${selectedLibraryId === library.id ? 'bg-emerald-50' : 'hover:bg-slate-50'}`}
                  >
                    <div className="font-semibold text-slate-800">{library.title}</div>
                    <div className="text-xs text-slate-500 font-mono mt-1">{library.id}</div>
                    {library.description && <p className="text-sm text-slate-600 mt-2">{library.description}</p>}
                  </button>
                ))}
              </div>
            </div>
          )}

          {docResult && (
            <div className="space-y-4">
              {(docResult.infoSnippets || []).slice(0, 3).map((snippet, index) => (
                <div key={`${snippet.pageId || 'info'}-${index}`} className="rounded-2xl border border-slate-200 bg-white/75 p-4 shadow-sm shadow-slate-100/60">
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <div>
                      <div className="text-sm font-semibold text-slate-800">{snippet.breadcrumb || 'Documentation snippet'}</div>
                      {snippet.pageId && <div className="text-xs text-slate-500 break-all">{snippet.pageId}</div>}
                    </div>
                    {snippet.pageId && (
                      <a
                        href={snippet.pageId}
                        target="_blank"
                        rel="noreferrer"
                        className="text-slate-500 hover:text-slate-800"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    )}
                  </div>
                  <p className="text-sm text-slate-700 whitespace-pre-wrap">{snippet.content}</p>
                </div>
              ))}

              {(docResult.codeSnippets || []).slice(0, 2).map((snippet, index) => (
                <div key={`${snippet.codeTitle || 'code'}-${index}`} className="overflow-hidden rounded-2xl border border-slate-200 bg-white/75 shadow-sm shadow-slate-100/60">
                  <div className="border-b border-slate-100 bg-slate-50 px-4 py-3">
                    <div className="font-semibold text-slate-800">{snippet.codeTitle || snippet.pageTitle || 'Code snippet'}</div>
                    {snippet.codeDescription && <p className="text-sm text-slate-600 mt-1">{snippet.codeDescription}</p>}
                  </div>
                  <div className="p-4 space-y-3">
                    {(snippet.codeList || []).slice(0, 2).map((block, blockIndex) => (
                      <div key={`${block.language || 'txt'}-${blockIndex}`} className="rounded-lg bg-slate-950 text-slate-100 p-4 overflow-x-auto">
                        <div className="text-xs uppercase tracking-wide text-slate-400 mb-2">{block.language || snippet.codeLanguage || 'text'}</div>
                        <pre className="text-xs whitespace-pre-wrap">{block.code}</pre>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
